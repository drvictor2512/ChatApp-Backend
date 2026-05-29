import * as userUsecase from '../../../application/usecases/userUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const searchUserByEmail = async (req, res) => {
    try {
        const result = await userUsecase.searchUserByEmail({ email: req.query.email })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const updateProfile = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.updateProfile({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const uploadAvatar = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.uploadAvatar({ token, file: req.file })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const uploadBanner = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.uploadBanner({ token, file: req.file })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getProfile = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.getProfile({ token })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getUserById = async (req, res) => {
    try {
        const result = await userUsecase.getUserById({ id: req.params.id })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const blockUser = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.blockUser({ token, targetId: req.body?.targetId })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const unblockUser = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.unblockUser({ token, targetId: req.body?.targetId })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getBlockedUsers = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.getBlockedUsers({ token })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getBlockStatus = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await userUsecase.getBlockStatus({ token, targetId: req.params.targetId })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export default {
    updateProfile,
    uploadAvatar,
    getProfile,
    searchUserByEmail,
    getUserById,
    blockUser,
    unblockUser,
    getBlockedUsers,
    getBlockStatus,
}
