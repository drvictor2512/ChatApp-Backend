import * as authUsecase from '../../../application/usecases/authUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const signUp = async (req, res) => {
    try {
        const result = await authUsecase.signUp(req.body)
        return res.status(201).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message, ...(httpError.details || {}) })
    }
}

export const verifySignUpOTP = async (req, res) => {
    try {
        const result = await authUsecase.verifySignUpOTP(req.body)
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const signIn = async (req, res) => {
    try {
        const result = await authUsecase.signIn(req.body)
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const changePassword = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await authUsecase.changePassword({ token, ...req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const closeAccount = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        const result = await authUsecase.closeAccount({ token, ...req.body })
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const forgotPassword = async (req, res) => {
    try {
        const result = await authUsecase.forgotPassword(req.body)
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}

export const resetPassword = async (req, res) => {
    try {
        const result = await authUsecase.resetPassword(req.body)
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ message: httpError.message })
    }
}
