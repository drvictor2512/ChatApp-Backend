import jwt from 'jsonwebtoken'
import User from '../../repository/mongoose/models/User.js'

export async function signoutByToken(token) {
    if (!token) return false
    const decoded = jwt.decode(token)
    if (!decoded?.userId) return false
    const user = await User.findById(decoded.userId).select('-password').lean()
    if (!user) return false
    return user
}

export default signoutByToken
