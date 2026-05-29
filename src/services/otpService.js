import { sendEmail } from '../infrastructure/libs/nodeMailer.js'
import { hashData, verifyHashedData } from '../infrastructure/libs/hashData.js'
import { generateOTP } from '../shared/util/generateOTP.js'
import { AppError } from '../shared/errors/AppError.js'
import { otpRepository, userRepository } from '../repository/mongoose/repositories/index.js'

export const sendVerificationOTPEmail = async ({
    email,
    subject = 'Mã xác thực từ ChatApp',
    message = 'Vui lòng sử dụng mã OTP dưới đây để xác thực tài khoản của bạn:',
    duration = 1,
}) => {
    if (!email) throw new AppError('Thiếu thông tin bắt buộc: email', 400)

    await otpRepository.deleteByEmail(email)

    const generatedOTP = await generateOTP()

    const mailOptions = {
        from: process.env.RESEND_DOMAIN,
        to: email,
        subject,
        html: `<p>${message}</p><p style="color:tomato; font-size:25px; letter-spacing: 2px;"><b>${generatedOTP}</b></p><p>Mã OTP này sẽ hết hạn trong 15 phút.</p>`,
    }

    await sendEmail(mailOptions)

    const hashedOTP = await hashData(generatedOTP)
    const newOTP = await otpRepository.createOtp({
        email,
        otp: hashedOTP,
        createdAt: Date.now(),
        expiresAt: Date.now() + duration * 15 * 60 * 1000,
    })

    return { success: true, message: 'Gửi mã OTP thành công', createdOTP: newOTP }
}

export const verifyOTPInternal = async (email, otp) => {
    if (!(email && otp)) throw new AppError('Thiếu thông tin bắt buộc', 400)

    const existingOTP = await otpRepository.findByEmail(email)
    if (!existingOTP) throw new AppError('OTP không tồn tại', 400)

    if (existingOTP.expiresAt < Date.now()) {
        await otpRepository.deleteByEmail(email)
        throw new AppError('OTP đã hết hạn', 400)
    }

    const validOTP = await verifyHashedData(otp, existingOTP.otp)
    if (!validOTP) throw new AppError('OTP không hợp lệ', 400)

    await userRepository.updateByEmail(email, { $set: { verified: true } })
    await otpRepository.deleteByEmail(email)
    return true
}
