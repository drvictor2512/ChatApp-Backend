import Conversation from '../../../repository/mongoose/models/Conversation.js';
import { getUserByToken } from '../../../infrastructure/libs/verifyToken.js';

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

// Middleware kiểm tra thành viên của cuộc trò chuyện nhóm
export default async function checkGroupMember(req, res, next) {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conversationId = req.body?.conversationId || req.params?.conversationId
        if (!conversationId) return res.status(400).json({ message: 'conversationId is required' });

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

        if (conversation.type === 'GROUP') {
            const isMember = (conversation.participants || []).some(p => String(p.userId) === String(user._id));
            if (!isMember) {
                return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' });
            }
        }
        req.conversation = conversation;
        req.user = user;
        next();
    } catch (err) {
        console.error('Error in checkGroupMember middleware', err);
        return res.status(500).json({ message: 'Lỗi máy chủ nội bộ' });
    }
}
