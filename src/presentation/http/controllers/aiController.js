import * as aiUsecase from '../../../application/usecases/aiUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const getAIConversation = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await aiUsecase.getAIConversation({ token })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const clearAIMessages = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await aiUsecase.clearAIMessages({
            token,
            conversationId: req.query.conversationId,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getAIMessages = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await aiUsecase.getAIMessages({
            token,
            conversationId: req.query.conversationId,
            limit: req.query.limit,
            before: req.query.before,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}
