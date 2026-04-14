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

const getUploadedFiles = (req) => {
    if (Array.isArray(req.files) && req.files.length > 0) {
        return req.files
    }
    if (req.files && typeof req.files === 'object') {
        const imageFiles = Array.isArray(req.files.image) ? req.files.image : []
        const genericFiles = Array.isArray(req.files.file) ? req.files.file : []
        return [...imageFiles, ...genericFiles]
    }
    if (req.file) {
        return [req.file]
    }
    return []
}

const buildMessageFiles = async (req) => {
    const uploadedFiles = getUploadedFiles(req)
    if (!uploadedFiles.length) {
        return { fileUrl: undefined, fileUrls: [] }
    }

    const fileUrls = await Promise.all(uploadedFiles.map((file) => uploadFile(file)))
    return {
        fileUrl: fileUrls[0],
        fileUrls,
    }
}

const normalizeEmoji = (emoji) => {
    if (typeof emoji !== 'string') return null
    const normalized = emoji.trim()
    return normalized || null
}

const parseBoolean = (value, defaultValue = true) => {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (value === 1) return true
        if (value === 0) return false
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (normalized === 'true' || normalized === '1') return true
        if (normalized === 'false' || normalized === '0') return false
    }
    return defaultValue
}

const ensureConversationMember = async ({ conversationId, userId }) => {
    const conversation = await Conversation.findById(conversationId)
    if (!conversation) {
        return { error: { status: 404, message: 'Conversation not found' } }
    }
    const isMember = (conversation.participants || []).some(p => String(p.userId) === String(userId))
    if (!isMember) {
        return { error: { status: 403, message: 'Bạn không có quyền thao tác trong cuộc trò chuyện này' } }
    }
    return { conversation }
}

const populateMessage = (messageId) => {
    return Message.findById(messageId)
        .populate('senderId', 'name avatarUrl email dateOfBirth verified createdAt bio')
        .populate('reactions.userId', 'name avatarUrl')
        .populate('pinnedBy', 'name avatarUrl')
        .populate('replyTo', 'content fileUrl fileUrls senderId isRecalled createdAt')
        .populate('replyTo.senderId', 'name avatarUrl')
        .populate('forwardedFrom.originalSenderId', 'name avatarUrl')
}

const resolveReplyTarget = async ({ replyToMessageId, conversationId }) => {
    const normalizedReplyId = String(replyToMessageId || '').trim()
    if (!normalizedReplyId) return null

    const replyMessage = await Message.findById(normalizedReplyId)
    if (!replyMessage) {
        return { error: { status: 404, message: 'Tin nhắn reply không tồn tại' } }
    }

    if (String(replyMessage.conversationId) !== String(conversationId)) {
        return { error: { status: 400, message: 'Tin nhắn reply không thuộc cuộc trò chuyện này' } }
    }

    return { replyMessage }
}

const appendSystemMessageAndEmit = async ({ conversation, senderId, content }) => {
    const systemMessage = await Message.create({
        conversationId: conversation._id,
        senderId,
        content,
        isSystem: true,
    })

    conversation.lastMessage = {
        _id: systemMessage._id,
        content: systemMessage.content,
        senderId,
        createdAt: systemMessage.createdAt,
    }
    conversation.lastMessageAt = systemMessage.createdAt
    await conversation.save()

    try {
        const io = getIo()
        if (io) {
            io.to(`conv:${conversation._id}`).emit('new_message', systemMessage)
        }
    } catch (e) {
        console.error('Socket emit failed', e)
    }
}
export const sendDirectMessage = async (req, res) => {
    try {
        const { recipientId, content, conversationId, replyToMessageId } = req.body;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const senderId = user._id;

        let conversation;
        // Kiểm tra nội dung tin nhắn hoặc file
        const uploadedFiles = getUploadedFiles(req)
        if (!content && uploadedFiles.length === 0) {
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
        const { fileUrl, fileUrls } = await buildMessageFiles(req)
        const replyResolution = await resolveReplyTarget({
            replyToMessageId,
            conversationId: conversation._id,
        })
        if (replyResolution?.error) {
            return res.status(replyResolution.error.status).json({ message: replyResolution.error.message })
        }

        const message = await Message.create({
            conversationId: conversation._id,
            senderId,
            content,
            fileUrl,
            fileUrls,
            replyTo: replyResolution?.replyMessage?._id || null,
        })
        const populatedMessage = await populateMessage(message._id)
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
        return res.status(500).json({ message: error.message })
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
        message.fileUrls = []
        message.reactions = []
        message.pinnedAt = null
        message.pinnedBy = null
        await message.save()

        const populatedMessage = await populateMessage(message._id)

        try {
            const io = getIo()
            if (io) {
                io.to(`conv:${message.conversationId}`).emit('message_recalled', { messageId: message._id, conversationId: message.conversationId })
                io.to(`conv:${message.conversationId}`).emit('message_reaction_updated', {
                    conversationId: String(message.conversationId),
                    message: populatedMessage,
                })
                io.to(`conv:${message.conversationId}`).emit('message_pin_updated', {
                    conversationId: String(message.conversationId),
                    message: populatedMessage,
                })
            }
        } catch (e) { }

        return res.json({ success: true, messageId: message._id })
    } catch (error) {
        console.error('Lỗi thu hồi tin nhắn:', error)
        return res.status(500).json({ message: error.message })
    }
}

export const sendGroupMessage = async (req, res) => {
    try {
        const { content, conversationId, replyToMessageId } = req.body;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const senderId = user._id;
        const conversation = req.conversation;
        const uploadedFiles = getUploadedFiles(req)
        if (!content && uploadedFiles.length === 0) {
            return res.status(400).json({ message: 'Nội dung không được để trống' })
        }
        const { fileUrl, fileUrls } = await buildMessageFiles(req)
        const replyResolution = await resolveReplyTarget({
            replyToMessageId,
            conversationId,
        })
        if (replyResolution?.error) {
            return res.status(replyResolution.error.status).json({ message: replyResolution.error.message })
        }

        const message = await Message.create({
            conversationId,
            senderId,
            content,
            fileUrl,
            fileUrls,
            replyTo: replyResolution?.replyMessage?._id || null,
        })
        const populatedMessage = await populateMessage(message._id)
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
        return res.status(500).json({ message: error.message })
    }

}

export const reactToMessage = async (req, res) => {
    try {
        const { messageId } = req.params
        const { emoji } = req.body || {}
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })

        let user
        try {
            user = await getUserByToken(token)
        } catch (e) {
            return res.status(401).json({ message: e.message })
        }

        const message = await Message.findById(messageId)
        if (!message) return res.status(404).json({ message: 'Tin nhắn không tồn tại' })

        const { error } = await ensureConversationMember({ conversationId: message.conversationId, userId: user._id })
        if (error) return res.status(error.status).json({ message: error.message })

        const chosenEmoji = normalizeEmoji(emoji)
        if (!chosenEmoji) {
            return res.status(400).json({ message: 'emoji là bắt buộc' })
        }
        const reactionIndex = (message.reactions || []).findIndex(r => String(r.userId) === String(user._id))
        if (reactionIndex >= 0) {
            message.reactions[reactionIndex].emoji = chosenEmoji
            message.reactions[reactionIndex].reactedAt = new Date()
        } else {
            message.reactions.push({ userId: user._id, emoji: chosenEmoji, reactedAt: new Date() })
        }

        await message.save()
        const populatedMessage = await populateMessage(message._id)

        try {
            const io = getIo()
            if (io) {
                io.to(`conv:${message.conversationId}`).emit('message_reaction_updated', {
                    conversationId: String(message.conversationId),
                    message: populatedMessage,
                })
            }
        } catch (e) {
            console.error('Socket emit failed', e)
        }

        return res.status(200).json({ message: populatedMessage })
    } catch (error) {
        console.error('Lỗi reaction tin nhắn:', error)
        return res.status(500).json({ message: error.message })
    }
}

export const removeMessageReaction = async (req, res) => {
    try {
        const { messageId } = req.params
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })

        let user
        try {
            user = await getUserByToken(token)
        } catch (e) {
            return res.status(401).json({ message: e.message })
        }

        const message = await Message.findById(messageId)
        if (!message) return res.status(404).json({ message: 'Tin nhắn không tồn tại' })

        const { error } = await ensureConversationMember({ conversationId: message.conversationId, userId: user._id })
        if (error) return res.status(error.status).json({ message: error.message })

        message.reactions = (message.reactions || []).filter(r => String(r.userId) !== String(user._id))
        await message.save()
        const populatedMessage = await populateMessage(message._id)

        try {
            const io = getIo()
            if (io) {
                io.to(`conv:${message.conversationId}`).emit('message_reaction_updated', {
                    conversationId: String(message.conversationId),
                    message: populatedMessage,
                })
            }
        } catch (e) {
            console.error('Socket emit failed', e)
        }

        return res.status(200).json({ message: populatedMessage })
    } catch (error) {
        console.error('Lỗi gỡ reaction tin nhắn:', error)
        return res.status(500).json({ message: error.message })
    }
}

export const togglePinMessage = async (req, res) => {
    try {
        const { messageId } = req.params
        const { isPinned } = req.body || {}
        const shouldPin = parseBoolean(isPinned, true)
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })

        let user
        try {
            user = await getUserByToken(token)
        } catch (e) {
            return res.status(401).json({ message: e.message })
        }

        const message = await Message.findById(messageId)
        if (!message) return res.status(404).json({ message: 'Tin nhắn không tồn tại' })

        const permission = await ensureConversationMember({ conversationId: message.conversationId, userId: user._id })
        const { error, conversation } = permission
        if (error) return res.status(error.status).json({ message: error.message })

        const alreadyPinned = !!message.pinnedAt
        if (shouldPin && alreadyPinned) {
            const populatedMessage = await populateMessage(message._id)
            return res.status(200).json({ message: populatedMessage })
        }
        if (!shouldPin && !alreadyPinned) {
            const populatedMessage = await populateMessage(message._id)
            return res.status(200).json({ message: populatedMessage })
        }

        if (shouldPin) {
            message.pinnedAt = new Date()
            message.pinnedBy = user._id
        } else {
            message.pinnedAt = null
            message.pinnedBy = null
        }

        await message.save()
        const populatedMessage = await populateMessage(message._id)

        try {
            const io = getIo()
            if (io) {
                io.to(`conv:${message.conversationId}`).emit('message_pin_updated', {
                    conversationId: String(message.conversationId),
                    message: populatedMessage,
                })
            }
        } catch (e) {
            console.error('Socket emit failed', e)
        }

        const actionText = shouldPin ? 'đã ghim một tin nhắn' : 'đã gỡ ghim một tin nhắn'
        try {
            await appendSystemMessageAndEmit({
                conversation,
                senderId: user._id,
                content: `${user.name} ${actionText}`,
            })
        } catch (e) {
            console.error('Lỗi tạo system message pin/unpin:', e)
        }

        return res.status(200).json({ message: populatedMessage })
    } catch (error) {
        console.error('Lỗi ghim/bỏ ghim tin nhắn:', error)
        return res.status(500).json({ message: error.message })
    }
}

export const forwardMessage = async (req, res) => {
    try {
        const {
            messageId,
            targetConversationIds = [],
            targetUserIds = [],
        } = req.body || {}

        const sourceId = messageId
        if (!sourceId) {
            return res.status(400).json({ message: 'sourceMessageId hoặc messageId là bắt buộc' })
        }

        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })

        let user
        try {
            user = await getUserByToken(token)
        } catch (e) {
            return res.status(401).json({ message: e.message })
        }

        const sourceMessage = await Message.findById(sourceId)
        if (!sourceMessage) return res.status(404).json({ message: 'Tin nhắn nguồn không tồn tại' })
        if (sourceMessage.isRecalled) return res.status(400).json({ message: 'Không thể forward tin nhắn đã thu hồi' })

        const sourcePermission = await ensureConversationMember({
            conversationId: sourceMessage.conversationId,
            userId: user._id,
        })
        if (sourcePermission.error) {
            return res.status(sourcePermission.error.status).json({ message: sourcePermission.error.message })
        }

        const uniqueConversationIds = new Set((targetConversationIds || []).map(String))

        for (const targetUserId of targetUserIds || []) {
            const normalizedTargetUserId = String(targetUserId)
            if (normalizedTargetUserId === String(user._id)) continue

            let directConv = await Conversation.findOne({
                type: 'DIRECT',
                'participants.userId': { $all: [String(user._id), normalizedTargetUserId] },
            })

            if (!directConv) {
                directConv = await Conversation.create({
                    type: 'DIRECT',
                    participants: [
                        { userId: user._id, joinedAt: new Date() },
                        { userId: normalizedTargetUserId, joinedAt: new Date() },
                    ],
                    lastMessageAt: new Date(),
                    unreadCounts: new Map(),
                })
            }

            uniqueConversationIds.add(String(directConv._id))
        }

        if (uniqueConversationIds.size === 0) {
            return res.status(400).json({ message: 'Cần ít nhất 1 đích để forward' })
        }

        const forwardedMessages = []

        for (const conversationId of uniqueConversationIds) {
            const permission = await ensureConversationMember({ conversationId, userId: user._id })
            if (permission.error) continue

            const conversation = permission.conversation
            const newMessage = await Message.create({
                conversationId,
                senderId: user._id,
                content: sourceMessage.content,
                fileUrl: sourceMessage.fileUrl,
                fileUrls: Array.isArray(sourceMessage.fileUrls) ? sourceMessage.fileUrls : [],
                isForwarded: true,
                forwardedFrom: {
                    messageId: sourceMessage._id,
                    originalSenderId: sourceMessage.senderId,
                    originalConversationId: sourceMessage.conversationId,
                },
            })

            updateConversationAfterCreateMessage(conversation, newMessage, user._id)
            await conversation.save()

            const populatedMessage = await populateMessage(newMessage._id)
            forwardedMessages.push(populatedMessage)

            try {
                const io = getIo()
                if (io) {
                    io.to(`conv:${conversationId}`).emit('new_message', populatedMessage)
                }
            } catch (e) {
                console.error('Socket emit failed', e)
            }
        }

        return res.status(201).json({ count: forwardedMessages.length, messages: forwardedMessages })
    } catch (error) {
        console.error('Lỗi forward tin nhắn:', error)
        return res.status(500).json({ message: error.message })
    }
}