import Conversation from '../models/Conversation.js'
import User from '../models/User.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const checkGroupAdmin = async (req, res, next) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        const user = await User.findOne({ token })
        if (!user) return res.status(401).json({ message: 'Unauthorized' })

        const conversationId = req.body?.conversationId || req.params?.conversationId
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' })

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        // owner or deputy allowed
        const isOwner = conv.groupId && String(conv.groupId.ownerId) === String(user._id)
        const isDeputy = conv.groupId && Array.isArray(conv.groupId.deputyIds) && conv.groupId.deputyIds.map(String).includes(String(user._id))
        if (!isOwner && !isDeputy) return res.status(403).json({ message: 'Không đủ quyền' })

        req.conversation = conv
        req.user = user
        next()
    } catch (e) {
        console.error('checkGroupAdmin error', e)
        return res.status(500).json({ message: 'Server error' })
    }
}

export const checkGroupOwner = async (req, res, next) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        const user = await User.findOne({ token })
        if (!user) return res.status(401).json({ message: 'Unauthorized' })

        const conversationId = req.body?.conversationId || req.params?.conversationId
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' })

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        const isOwner = conv.groupId && String(conv.groupId.ownerId) === String(user._id)
        if (!isOwner) return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền này' })

        req.conversation = conv
        req.user = user
        next()
    } catch (e) {
        console.error('checkGroupOwner error', e)
        return res.status(500).json({ message: 'Server error' })
    }
}

export default checkGroupAdmin
