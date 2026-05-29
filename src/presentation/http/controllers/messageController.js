import * as messageUsecase from '../../../application/usecases/messageUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const sendDirectMessage = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.sendDirectMessage({
            token,
            body: req.body,
            files: req.files,
            file: req.file,
        })
        return res.status(201).json({ message: result })
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const sendGroupMessage = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.sendGroupMessage({
            token,
            body: req.body,
            files: req.files,
            file: req.file,
            conversation: req.conversation,
        })
        return res.status(201).json({ message: result })
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const recallMessage = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.recallMessage({ token, messageId: req.params.messageId })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const reactToMessage = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.reactToMessage({
            token,
            messageId: req.params.messageId,
            emoji: req.body?.emoji,
        })
        return res.status(200).json({ message: result })
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const removeMessageReaction = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.removeMessageReaction({
            token,
            messageId: req.params.messageId,
        })
        return res.status(200).json({ message: result })
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const togglePinMessage = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.togglePinMessage({
            token,
            messageId: req.params.messageId,
            isPinned: req.body?.isPinned,
        })
        return res.status(200).json({ message: result.message })
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const forwardMessage = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await messageUsecase.forwardMessage({ token, body: req.body })
        return res.status(201).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}
