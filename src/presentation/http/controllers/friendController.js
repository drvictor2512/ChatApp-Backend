import * as friendUsecase from '../../../application/usecases/friendUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const sendFriendRequest = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.sendFriendRequest({ token, body: req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const acceptFriendRequest = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.acceptFriendRequest({
            token,
            requestId: req.params.requestId,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const declineFriendRequest = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.declineFriendRequest({
            token,
            requestId: req.params.requestId,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const revokeFriendRequest = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.revokeFriendRequest({
            token,
            requestId: req.params.requestId,
        })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getAllFriends = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.getAllFriends({ token })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const getFriendsRequest = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.getFriendsRequest({ token })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const unfriend = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await friendUsecase.unfriend({ token, otherUserId: req.params.otherUserId })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}
