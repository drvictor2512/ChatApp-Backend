import { uploadFile } from '../shared/util/fileService.js'
import { getUserByToken } from '../infrastructure/libs/verifyToken.js'
import { getIo } from '../infrastructure/libs/socket.js'
import { AppError } from '../shared/errors/AppError.js'
import { userRepository } from '../repository/mongoose/repositories/index.js'

const ensureTokenUser = async (token) => {
    if (!token) throw new AppError('Token không tồn tại trong header Authorization', 401)
    try {
        return await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }
}

const sanitizeUser = (userDoc) => {
    if (!userDoc) return null
    const safe = userDoc.toObject ? userDoc.toObject() : { ...userDoc }
    delete safe.password
    return safe
}

export const searchUserByEmail = async ({ email }) => {
    if (!email) throw new AppError('Email is required', 400)
    const user = await userRepository.findByEmailLean(email, '_id email name avatarUrl')
    if (!user) throw new AppError('User not found', 404)
    return { user }
}

export const updateProfile = async ({ token, body }) => {
    const user = await ensureTokenUser(token)
    const { name, dateOfBirth, bio, gender, bannerUrl } = body || {}

    if (name) user.name = name
    if (typeof bio !== 'undefined') user.bio = bio

    if (typeof gender !== 'undefined') {
        const allowed = ['Nam', 'Nữ']
        if (!allowed.includes(gender)) throw new AppError('Giới tính không hợp lệ', 400)
        user.gender = gender
    }

    if (typeof bannerUrl !== 'undefined') user.bannerUrl = bannerUrl

    if (dateOfBirth) {
        const d = new Date(dateOfBirth)
        if (Number.isNaN(d.getTime())) throw new AppError('Ngày sinh không hợp lệ', 400)
        user.dateOfBirth = d
    }

    await user.save()

    return { message: 'Cập nhật thông tin thành công', user: sanitizeUser(user) }
}

export const uploadAvatar = async ({ token, file }) => {
    const user = await ensureTokenUser(token)

    if (!file) throw new AppError('Không có file được gửi lên', 400)
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        throw new AppError('Chỉ cho phép file hình ảnh cho avatar', 400)
    }

    const uploadedUrl = await uploadFile(file)
    user.avatarUrl = uploadedUrl
    await user.save()

    return { message: 'Tải ảnh đại diện lên thành công', avatarUrl: uploadedUrl, user: sanitizeUser(user) }
}

export const uploadBanner = async ({ token, file }) => {
    const user = await ensureTokenUser(token)

    if (!file) throw new AppError('Không có file được gửi lên', 400)
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        throw new AppError('Chỉ cho phép file hình ảnh cho banner', 400)
    }

    const uploadedUrl = await uploadFile(file)
    user.bannerUrl = uploadedUrl
    await user.save()

    return { message: 'Tải banner lên thành công', bannerUrl: uploadedUrl, user: sanitizeUser(user) }
}

export const getProfile = async ({ token }) => {
    const user = await ensureTokenUser(token)
    return { user: sanitizeUser(user) }
}

export const getUserById = async ({ id }) => {
    if (!id) throw new AppError('Id is required', 400)
    const user = await userRepository.findByIdLean(id, '-password')
    if (!user) throw new AppError('User not found', 404)
    return { user }
}

export const blockUser = async ({ token, targetId }) => {
    const user = await ensureTokenUser(token)
    if (!targetId) throw new AppError('targetId is required', 400)
    if (String(user._id) === String(targetId)) throw new AppError('Không thể tự chặn bản thân', 400)

    if (!user.blockedUsers.map(String).includes(String(targetId))) {
        user.blockedUsers.push(targetId)
        await user.save()
    }

    const io = getIo()
    if (io) io.to(`user:${targetId}`).emit('you_were_blocked', { blockerId: String(user._id) })

    return { message: 'Đã chặn người dùng' }
}

export const unblockUser = async ({ token, targetId }) => {
    const user = await ensureTokenUser(token)
    if (!targetId) throw new AppError('targetId is required', 400)

    user.blockedUsers = user.blockedUsers.filter((id) => String(id) !== String(targetId))
    await user.save()

    const io = getIo()
    if (io) io.to(`user:${targetId}`).emit('you_were_unblocked', { unblockerId: String(user._id) })

    return { message: 'Đã bỏ chặn người dùng' }
}

export const getBlockedUsers = async ({ token }) => {
    const user = await ensureTokenUser(token)
    const hydrated = await user.constructor
        .findById(user._id)
        .populate('blockedUsers', '_id name avatarUrl email')
        .lean()

    return { blockedUsers: hydrated?.blockedUsers || [] }
}

export const getBlockStatus = async ({ token, targetId }) => {
    const user = await ensureTokenUser(token)
    if (!targetId) throw new AppError('targetId is required', 400)

    const targetUser = await userRepository.findByIdLean(targetId, 'blockedUsers')
    if (!targetUser) throw new AppError('User not found', 404)

    const blockedByMe = (user.blockedUsers || []).map(String).includes(String(targetId))
    const blockedByTarget = (targetUser.blockedUsers || []).map(String).includes(String(user._id))

    return {
        targetId: String(targetId),
        blockedByMe,
        blockedByTarget,
        canMessage: !(blockedByMe || blockedByTarget),
    }
}
