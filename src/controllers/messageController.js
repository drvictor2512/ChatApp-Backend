import User from "../models/User.js";
import { getUserByToken } from '../libs/verifyToken.js';
import Conversation from './../models/Conversation.js';
import Message from './../models/Message.js';
import { updateConversationAfterCreateMessage } from './../util/messageHelper.js';
import { uploadFile } from '../util/fileService.js';
import { getIo } from '../libs/socket.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}
export const sendDirectMessage = async (req, res) => {
    try {
        const { recipientId, content, conversationId } = req.body;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const senderId = user._id;

        let conversation;
        // Kiểm tra nội dung tin nhắn hoặc file
        if (!content && !req.file) {
            return res.status(400).json({ message: 'Nội dung không được để trống' })
        }
        // Kiểm tra cuộc trò chuyện có tồn tại
        if (conversationId) {
            conversation = await Conversation.findById(conversationId);
        }
        // Kiểm tra nếu cuộc trò chuyện tồn tại và là cuộc trò chuyện trực tiếp thì kiểm tra xem người gửi có bị người nhận chặn hay không
        if (conversation && conversation.type === 'DIRECT') {
            const otherParticipant = conversation.participants.find(p => String(p.userId) !== String(senderId))
            if (otherParticipant) {
                const otherUser = await User.findById(otherParticipant.userId).select('blockedUsers').lean()
                // Kiểm tra nếu người nhận đã chặn người gửi
                if (otherUser && otherUser.blockedUsers && otherUser.blockedUsers.map(String).includes(String(senderId))) {
                    return res.status(403).json({ message: 'Bạn đã bị chặn bởi người này' })
                }
                // Kiểm tra nếu người gửi đã chặn người nhận
                if (user.blockedUsers && user.blockedUsers.map(String).includes(String(otherParticipant.userId))) {
                    return res.status(403).json({ message: 'Bạn đã chặn người này. Bỏ chặn để gửi tin nhắn.' })
                }
            }
        }
        // Nếu không tồn tại cuộc trò chuyện, tạo cuộc trò chuyện mới
        if (!conversationId) {
            conversation = await Conversation.create({
                type: 'DIRECT',
                participants: [
                    { userId: senderId, joinedAt: new Date() },
                    { userId: recipientId, joinedAt: new Date() },
                ],
                lastMessageAt: new Date(),
                unreadCounts: new Map()
            })
        }
        const fileUrl = req.file ? await uploadFile(req.file) : undefined;
        const message = await Message.create({
            conversationId: conversation._id,
            senderId,
            content,
            fileUrl,
        })
        // Populate nguời gửi để client nhận được thông tin ngay lập tức mà không cần phải reload
        const populatedMessage = await Message.findById(message._id).populate('senderId', 'name avatarUrl email dateOfBirth verified createdAt bio')
        updateConversationAfterCreateMessage(conversation, message, senderId);
        await conversation.save();
        // Phát sự kiện socket tới phòng trò chuyện và phòng cá nhân của người nhận.
        try {
            const io = getIo()
            if (io) {
                io.to(`conv:${conversation._id}`).emit('new_message', populatedMessage)
            }
        } catch (e) {
            console.error('Socket emit failed', e)
        }
        return res.status(201).json({ message: populatedMessage })
    } catch (error) {
        console.error('Lỗi gửi tin nhắn trực tiếp:', error);
        return res.status(500).json({ message: 'Lỗi hệ thống' })
    }

}
export const recallMessage = async (req, res) => {
    try {
        const { messageId } = req.params
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const message = await Message.findById(messageId)
        if (!message) return res.status(404).json({ message: 'Tin nhắn không tồn tại' })
        if (String(message.senderId) !== String(user._id)) return res.status(403).json({ message: 'Không có quyền thu hồi tin nhắn này' })
        if (message.isRecalled) return res.status(400).json({ message: 'Tin nhắn đã được thu hồi' })

        message.isRecalled = true
        message.content = null
        message.fileUrl = null
        await message.save()

        try {
            const io = getIo()
            if (io) io.to(`conv:${message.conversationId}`).emit('message_recalled', { messageId: message._id, conversationId: message.conversationId })
        } catch (e) { }

        return res.json({ success: true, messageId: message._id })
    } catch (error) {
        console.error('Lỗi thu hồi tin nhắn:', error)
        return res.status(500).json({ message: 'Lỗi hệ thống' })
    }
}

export const sendGroupMessage = async (req, res) => {
    try {
        const { content, conversationId } = req.body;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const senderId = user._id;
        const conversation = req.conversation;
        if (!content && !req.file) {
            return res.status(400).json({ message: 'Nội dung không được để trống' })
        }
        const fileUrl = req.file ? await uploadFile(req.file) : undefined;
        const message = await Message.create({
            conversationId,
            senderId,
            content,
            fileUrl,
        })
        // Populate nguời gửi để client nhận được thông tin ngay lập tức mà không cần phải reload
        const populatedMessage = await Message.findById(message._id).populate('senderId', 'name avatarUrl email dateOfBirth verified createdAt bio')
        updateConversationAfterCreateMessage(conversation, message, senderId);
        await conversation.save();
        // Phát sự kiện socket tới phòng trò chuyện nhóm.
        try {
            const io = getIo()
            if (io) io.to(`conv:${conversation._id}`).emit('new_message', populatedMessage)
        } catch (e) {
            console.error('Socket emit failed', e)
        }
        return res.status(201).json({ message: populatedMessage })
    } catch (error) {
        console.error('Lỗi gửi tin nhắn nhóm:', error);
        return res.status(500).json({ message: 'Lỗi hệ thống' })
    }

}