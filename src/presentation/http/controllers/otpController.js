import * as otpUsecase from '../../../application/usecases/otpUsecase.js'
import { toHttpError } from '../../../shared/errors/AppError.js'

export const sendVerificationOTPEmail = async (req, res) => {
    try {
        const result = await otpUsecase.sendVerificationOTPEmail(req.body)
        return res.status(200).json(result)
    } catch (error) {
        const httpError = toHttpError(error, 400)
        return res.status(httpError.status).json({ success: false, message: httpError.message })
    }
}
