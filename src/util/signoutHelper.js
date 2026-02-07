import User from '../models/User.js'

export async function signoutByToken(token) {
    if (!token) return false
    const user = await User.findOne({ token })
    if (!user) return false
    user.verified = false
    user.token = null
    await user.save()
    return user
}

export default signoutByToken
