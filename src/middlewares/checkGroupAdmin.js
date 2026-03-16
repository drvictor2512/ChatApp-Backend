import Conversation from '../models/Conversation.js'
import { getUserByToken } from '../libs/verifyToken.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const checkGroupAdmin = async (req, res, next) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conversationId = req.body?.conversationId || req.params?.conversationId
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' })

        const conv = await Conversation.findById(conversationId)
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        const participant = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        if (!participant) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' })

        // owner or deputy allowed
        const isOwner = participant.role === 'Trưởng nhóm' || (conv.group?.ownerId && String(conv.group.ownerId) === String(user._id))
        const isDeputyByRole = participant.role === 'Phó nhóm'
        const isDeputyByField = Array.isArray(conv.group?.deputyIds) && conv.group.deputyIds.map(String).includes(String(user._id))
        const isDeputy = isDeputyByRole || isDeputyByField
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
        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conversationId = req.body?.conversationId || req.params?.conversationId
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' })

        const conv = await Conversation.findById(conversationId)
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        const participant = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        const isOwnerByRole = participant && participant.role === 'Trưởng nhóm'
        const isOwnerByField = conv.group?.ownerId && String(conv.group.ownerId) === String(user._id)
        const isOwner = isOwnerByRole || isOwnerByField
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
