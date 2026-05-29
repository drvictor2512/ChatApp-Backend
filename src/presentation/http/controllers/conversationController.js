import * as conversationUsecase from '../../../application/usecases/conversationUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const createConversation = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.createConversation({ token, body: req.body })
        return res.status(201).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message, ...(httpError.details || {}) })
    }
}

export const getConversations = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.getConversations({ token })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params
        const { limit = 30, cursor } = req.query
        const result = await conversationUsecase.getMessages({ conversationId, limit, cursor })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const renameGroup = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.renameGroup({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const updateGroupAvatar = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.updateGroupAvatar({ token, body: req.body, file: req.file })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const addGroupMember = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.addGroupMember({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const removeGroupMember = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.removeGroupMember({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const assignDeputy = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.assignDeputy({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const deleteGroup = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.deleteGroup({ token, conversationId: req.params.conversationId })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const leaveGroup = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.leaveGroup({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const markAsRead = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.markAsRead({
            token,
            conversationId: req.params.conversationId,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getInviteLink = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.getInviteLink({
            token,
            conversationId: req.params.conversationId,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const joinByInvite = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.joinByInvite({
            token,
            inviteCode: req.body?.inviteCode,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({
            message: httpError.message,
            ...(httpError.details || {}),
        })
    }
}

export const transferOwnership = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await conversationUsecase.transferOwnership({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}
