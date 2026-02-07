import jwt from 'jsonwebtoken'
import { signoutByToken } from '../util/signoutHelper.js'
// Xử lý token hết hạn
export default async function expireHandler(req, res, next) {
    try {
        const authHeader = req.headers.authorization || ''
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
        if (!token) return next()

        try {
            jwt.verify(token, process.env.TOKEN_KEY)
            return next()
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                try {
                    await signoutByToken(token)
                } catch (uErr) {
                    console.error('expireHandler: failed to clear expired token', uErr?.message || uErr)
                }
                return next()
            }
            return next()
        }
    } catch (e) {
        next()
    }
}
