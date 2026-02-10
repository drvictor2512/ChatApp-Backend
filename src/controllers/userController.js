import User from '../models/User.js'
import { uploadFile } from '../util/fileService.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const updateProfile = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) throw new Error('Token không tồn tại trong header Authorization')

        const user = await User.findOne({ token })
        if (!user) throw new Error('Người dùng không tồn tại hoặc token không hợp lệ')

        const { name, dateOfBirth, bio, gender, bannerUrl } = req.body
        if (name) user.name = name
        if (typeof bio !== 'undefined') user.bio = bio

        if (typeof gender !== 'undefined') {
            const allowed = ['Nam', 'Nữ']
            if (!allowed.includes(gender)) throw new Error('Giới tính không hợp lệ')
            user.gender = gender
        }

        if (typeof bannerUrl !== 'undefined') user.bannerUrl = bannerUrl

        if (dateOfBirth) {
            const d = new Date(dateOfBirth)
            if (Number.isNaN(d.getTime())) throw new Error('Ngày sinh không hợp lệ')
            user.dateOfBirth = d
        }

        await user.save()
        const safe = user.toObject()
        delete safe.password
        res.status(200).json({ message: 'Cập nhật thông tin thành công', user: safe })
    } catch (error) {
        res.status(400).json({ message: error.message })
    }
}

export const uploadAvatar = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) throw new Error('Token không tồn tại trong header Authorization')

        const user = await User.findOne({ token })
        if (!user) throw new Error('Người dùng không tồn tại hoặc token không hợp lệ')

        const file = req.file
        if (!file) throw new Error('Không có file được gửi lên')
        // Chỉ cho phép file hình ảnh cho avatar
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            throw new Error('Chỉ cho phép file hình ảnh cho avatar')
        }

        const uploadedUrl = await uploadFile(file)

        // Cập nhật URL ảnh đại diện cho người dùng vào database
        user.avatarUrl = uploadedUrl
        await user.save()

        const safe = user.toObject()
        delete safe.password
        res.status(200).json({ message: 'Tải ảnh đại diện lên thành công', avatarUrl: uploadedUrl, user: safe })
    } catch (error) {
        res.status(400).json({ message: error.message })
    }
}

export const uploadBanner = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) throw new Error('Token không tồn tại trong header Authorization')

        const user = await User.findOne({ token })
        if (!user) throw new Error('Người dùng không tồn tại hoặc token không hợp lệ')

        const file = req.file
        if (!file) throw new Error('Không có file được gửi lên')
        // Chỉ cho phép file hình ảnh cho banner
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            throw new Error('Chỉ cho phép file hình ảnh cho banner')
        }

        const uploadedUrl = await uploadFile(file)

        // Cập nhật URL ảnh banner cho người dùng vào database
        user.bannerUrl = uploadedUrl
        await user.save()

        const safe = user.toObject()
        delete safe.password
        res.status(200).json({ message: 'Tải banner lên thành công', bannerUrl: uploadedUrl, user: safe })
    } catch (error) {
        res.status(400).json({ message: error.message })
    }
}

export const getProfile = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) throw new Error('Token không tồn tại trong header Authorization')

        const user = await User.findOne({ token })
        if (!user) throw new Error('Người dùng không tồn tại hoặc token không hợp lệ')

        const safe = user.toObject()
        delete safe.password
        res.status(200).json({ user: safe })
    } catch (error) {
        res.status(400).json({ message: error.message })
    }
}

export default { updateProfile, uploadAvatar, getProfile }
