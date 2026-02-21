import jwt from 'jsonwebtoken'
import User from '../models/User.js'

export async function getUserByToken(token) {
    if (!token) throw new Error('Token không tồn tại')

    let decoded
    try {
        decoded = jwt.verify(token, process.env.TOKEN_KEY)
    } catch (err) {
        if (err.name === 'TokenExpiredError') throw new Error('Token đã hết hạn')
        throw new Error('Token không hợp lệ')
    }

    const user = await User.findById(decoded.userId)
    if (!user) throw new Error('Người dùng không tồn tại')

    return user
}

export default getUserByToken
