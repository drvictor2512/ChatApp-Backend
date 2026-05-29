import { hashData, verifyHashedData } from '../infrastructure/libs/hashData.js'
import { createToken } from '../infrastructure/libs/createToken.js'
import { getUserByToken } from '../infrastructure/libs/verifyToken.js'
import { sendEmail } from '../infrastructure/libs/nodeMailer.js'
import { AppError } from '../shared/errors/AppError.js'
import { generateOTP } from '../shared/util/generateOTP.js'
import {
    conversationRepository,
    friendRepository,
    friendRequestRepository,
    messageRepository,
    otpRepository,
    userRepository,
} from '../repository/mongoose/repositories/index.js'
import { verifyOTPInternal } from './otpService.js'

const validateEmail = (email) => /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)

export const signUp = async ({ email, password, name, gender, dateOfBirth }) => {
    if (!email || !password || !name) throw new AppError('Thiếu thông tin bắt buộc', 400)
    if (!validateEmail(email)) throw new AppError('Email không hợp lệ', 400)
    if (password.length < 8) throw new AppError('Mật khẩu phải có ít nhất 8 ký tự', 400)

    const existingUser = await userRepository.findByEmail(email)
    if (existingUser) throw new AppError('Email đã được sử dụng', 400)

    const allowedGenders = ['Nam', 'Nữ']
    if (typeof gender !== 'undefined' && !allowedGenders.includes(gender)) {
        throw new AppError('Giới tính không hợp lệ', 400)
    }

    let dob = undefined
    if (dateOfBirth) {
        const d = new Date(dateOfBirth)
        if (Number.isNaN(d.getTime())) throw new AppError('Ngày sinh không hợp lệ', 400)
        dob = d
    }

    const hashedPassword = await hashData(password)
    await userRepository.createUser({
        email,
        password: hashedPassword,
        name,
        gender,
        ...(dob ? { dateOfBirth: dob } : {}),
        verified: false,
    })

    return { message: 'Đăng ký thành công, vui lòng xác thực OTP' }
}

export const verifySignUpOTP = async ({ email, otp }) => {
    if (!email || !otp) throw new AppError('Thiếu thông tin bắt buộc', 400)
    await verifyOTPInternal(email, otp)
    return { message: 'Xác thực tài khoản thành công' }
}

export const signIn = async ({ email, password }) => {
    if (!email || !password) throw new AppError('Thiếu thông tin bắt buộc', 400)

    const fetchUser = await userRepository.findByEmail(email)
    if (!fetchUser) throw new AppError('Người dùng không tồn tại', 400)

    const isPasswordValid = await verifyHashedData(password, fetchUser.password)
    if (!isPasswordValid) throw new AppError('Mật khẩu không đúng', 400)

    if (!fetchUser.verified) {
        throw new AppError('Tài khoản chưa được xác thực. Vui lòng xác thực OTP trước khi đăng nhập', 400)
    }

    const token = await createToken({ userId: fetchUser._id, email })
    return { message: 'Đăng nhập thành công', fetchUser, token }
}

export const changePassword = async ({ token, oldPassword, newPassword }) => {
    if (!token) throw new AppError('Token không tồn tại trong header Authorization', 401)

    const user = await getUserByToken(token)
    const isPasswordValid = await verifyHashedData(oldPassword, user.password)
    if (!isPasswordValid) throw new AppError('Mật khẩu cũ không đúng', 400)

    if (newPassword.length < 8) throw new AppError('Mật khẩu mới phải có ít nhất 8 ký tự', 400)

    if (await verifyHashedData(newPassword, user.password)) {
        throw new AppError('Mật khẩu mới không được trùng với mật khẩu cũ', 400)
    }

    user.password = await hashData(newPassword)
    await user.save()

    return { message: 'Đổi mật khẩu thành công' }
}

export const closeAccount = async ({ token, password }) => {
    if (!token) throw new AppError('Token không tồn tại trong header Authorization', 401)
    if (!password) throw new AppError('Mật khẩu là bắt buộc để đóng tài khoản', 400)

    const user = await getUserByToken(token)
    const isPasswordValid = await verifyHashedData(password, user.password)
    if (!isPasswordValid) throw new AppError('Mật khẩu không đúng', 400)

    const userId = String(user._id)

    await friendRepository.deleteByUserId(user._id)
    await friendRequestRepository.deleteByUserId(user._id)

    const directConversations = await conversationRepository.findDirectConversationIdsByUser(user._id)
    const directConversationIds = (directConversations || []).map((item) => item._id)

    if (directConversationIds.length > 0) {
        await messageRepository.deleteManyByConversationIds(directConversationIds)
        await conversationRepository.deleteManyByIds(directConversationIds)
    }

    const groupConversations = await conversationRepository.findGroupConversationsByUser(user._id)

    for (const conv of groupConversations) {
        conv.participants = (conv.participants || []).filter(
            (participant) => String(participant.userId) !== userId,
        )

        if (conv.group) {
            conv.group.deputyIds = (conv.group.deputyIds || []).filter((id) => String(id) !== userId)

            if (String(conv.group.ownerId || '') === userId) {
                const nextOwner = conv.participants?.[0]?.userId || null
                conv.group.ownerId = nextOwner

                if (nextOwner) {
                    conv.participants = (conv.participants || []).map((participant) => {
                        if (String(participant.userId) === String(nextOwner)) {
                            return { ...participant.toObject(), role: 'Trưởng nhóm' }
                        }
                        return participant
                    })
                }
            }
        }

        if (!conv.participants || conv.participants.length === 0) {
            await messageRepository.deleteManyByConversationId(conv._id)
            await conversationRepository.deleteById(conv._id)
            continue
        }

        await conv.save()
    }

    await otpRepository.deleteByEmail(user.email)
    await userRepository.deleteById(user._id)

    return { message: 'Đóng tài khoản thành công' }
}

export const forgotPassword = async ({ email, subject, message, duration }) => {
    if (!email) throw new AppError('Email là bắt buộc', 400)

    const user = await userRepository.findByEmail(email)
    if (!user) throw new AppError('Người dùng không tồn tại', 400)

    await otpRepository.deleteByEmail(email)

    const generatedOTP = await generateOTP()
    const mailOption = {
        from: process.env.RESEND_DOMAIN,
        to: email,
        subject: subject || 'Reset mật khẩu',
        html: `<p>${message || 'Sử dụng OTP này để đặt lại mật khẩu của bạn:'}</p><p style="color:tomato; font-size:25px; letter-spacing: 2px;"><b>${generatedOTP}</b></p><p>Mã OTP này sẽ hết hạn trong 15 phút.</p>`,
    }

    await sendEmail(mailOption)

    const hashedOTP = await hashData(generatedOTP)
    await otpRepository.createOtp({
        email,
        otp: hashedOTP,
        createdAt: Date.now(),
        expiresAt: Date.now() + (duration || 1) * 15 * 60 * 1000,
    })

    return { message: 'OTP đã được gửi đến email của bạn' }
}

export const resetPassword = async ({ email, otp, newPassword }) => {
    if (!email || !otp || !newPassword) throw new AppError('Thiếu thông tin bắt buộc', 400)

    const validOTP = await verifyOTPInternal(email, otp)
    if (!validOTP) throw new AppError('OTP không hợp lệ hoặc đã hết hạn', 400)

    if (newPassword.length < 8) throw new AppError('Mật khẩu mới phải có ít nhất 8 ký tự', 400)

    const hashPassword = await hashData(newPassword)
    await userRepository.updatePasswordByEmail(email, hashPassword)
    await otpRepository.deleteByEmail(email)

    return { message: 'Đặt lại mật khẩu thành công' }
}
