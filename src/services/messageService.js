import { getUserByToken } from '../infrastructure/libs/verifyToken.js'
import { getIo } from '../infrastructure/libs/socket.js'
import { uploadFile } from '../shared/util/fileService.js'
import { updateConversationAfterCreateMessage } from '../shared/util/messageHelper.js'
import { AppError } from '../shared/errors/AppError.js'
import {
    conversationRepository,
    messageRepository,
    userRepository,
} from '../repository/mongoose/repositories/index.js'

const getUploadedFiles = ({ files, file }) => {
    if (Array.isArray(files) && files.length > 0) {
        return files
    }
    if (files && typeof files === 'object') {
        const imageFiles = Array.isArray(files.image) ? files.image : []
        const genericFiles = Array.isArray(files.file) ? files.file : []
        return [...imageFiles, ...genericFiles]
    }
    if (file) {
        return [file]
    }
    return []
}

const buildMessageFiles = async ({ files, file }) => {
    const uploadedFiles = getUploadedFiles({ files, file })
    if (!uploadedFiles.length) {
        return { fileUrl: undefined, fileUrls: [] }
    }

    const fileUrls = await Promise.all(uploadedFiles.map((item) => uploadFile(item)))
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
    const conversation = await conversationRepository.findById(conversationId)
    if (!conversation) {
        throw new AppError('Conversation not found', 404)
    }
    const isMember = (conversation.participants || []).some((p) => String(p.userId) === String(userId))
    if (!isMember) {
        throw new AppError('Bạn không có quyền thao tác trong cuộc trò chuyện này', 403)
    }
    return conversation
}

const populateMessage = (messageId) => messageRepository.populateMessageById(messageId)

const resolveReplyTarget = async ({ replyToMessageId, conversationId }) => {
    const normalizedReplyId = String(replyToMessageId || '').trim()
    if (!normalizedReplyId) return null

    const replyMessage = await messageRepository.findById(normalizedReplyId)
    if (!replyMessage) {
        throw new AppError('Tin nhắn reply không tồn tại', 404)
    }

    if (String(replyMessage.conversationId) !== String(conversationId)) {
        throw new AppError('Tin nhắn reply không thuộc cuộc trò chuyện này', 400)
    }

    return replyMessage
}

const appendSystemMessageAndEmit = async ({ conversation, senderId, content }) => {
    const systemMessage = await messageRepository.createMessage({
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

export const sendDirectMessage = async ({ token, body, files, file }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const { recipientId, content, conversationId, replyToMessageId } = body
    const senderId = user._id

    const uploadedFiles = getUploadedFiles({ files, file })
    if (!content && uploadedFiles.length === 0) {
        throw new AppError('Nội dung không được để trống', 400)
    }

    let conversation
    if (conversationId) {
        conversation = await conversationRepository.findById(conversationId)
    }

    if (conversation && conversation.type === 'DIRECT') {
        const otherParticipant = conversation.participants.find((p) => String(p.userId) !== String(senderId))
        if (otherParticipant) {
            const otherUser = await userRepository.findByIdSelect(otherParticipant.userId, 'blockedUsers')
            if (otherUser?.blockedUsers?.map(String).includes(String(senderId))) {
                throw new AppError('Bạn đã bị chặn bởi người này', 403)
            }
            if (user.blockedUsers?.map(String).includes(String(otherParticipant.userId))) {
                throw new AppError('Bạn đã chặn người này. Bỏ chặn để gửi tin nhắn.', 403)
            }
        }
    }

    if (!conversationId) {
        conversation = await conversationRepository.createDirectConversation({
            type: 'DIRECT',
            participants: [
                { userId: senderId, joinedAt: new Date() },
                { userId: recipientId, joinedAt: new Date() },
            ],
            lastMessageAt: new Date(),
            unreadCounts: new Map(),
        })
    }

    const { fileUrl, fileUrls } = await buildMessageFiles({ files, file })
    const replyMessage = await resolveReplyTarget({ replyToMessageId, conversationId: conversation._id })

    const message = await messageRepository.createMessage({
        conversationId: conversation._id,
        senderId,
        content,
        fileUrl,
        fileUrls,
        replyTo: replyMessage?._id || null,
    })

    const populatedMessage = await populateMessage(message._id)
    updateConversationAfterCreateMessage(conversation, message, senderId)
    await conversation.save()

    try {
        const io = getIo()
        if (io) {
            io.to(`conv:${conversation._id}`).emit('new_message', populatedMessage)
        }
    } catch (e) {
        console.error('Socket emit failed', e)
    }

    return populatedMessage
}

export const sendGroupMessage = async ({ token, body, files, file, conversation }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const { content, conversationId, replyToMessageId } = body
    const senderId = user._id

    const uploadedFiles = getUploadedFiles({ files, file })
    if (!content && uploadedFiles.length === 0) {
        throw new AppError('Nội dung không được để trống', 400)
    }

    if (!conversation) {
        conversation = await conversationRepository.findById(conversationId)
    }
    if (!conversation) throw new AppError('Conversation not found', 404)

    const { fileUrl, fileUrls } = await buildMessageFiles({ files, file })
    const replyMessage = await resolveReplyTarget({ replyToMessageId, conversationId })

    const message = await messageRepository.createMessage({
        conversationId,
        senderId,
        content,
        fileUrl,
        fileUrls,
        replyTo: replyMessage?._id || null,
    })

    const populatedMessage = await populateMessage(message._id)
    updateConversationAfterCreateMessage(conversation, message, senderId)
    await conversation.save()

    try {
        const io = getIo()
        if (io) io.to(`conv:${conversation._id}`).emit('new_message', populatedMessage)
    } catch (e) {
        console.error('Socket emit failed', e)
    }

    return populatedMessage
}

export const recallMessage = async ({ token, messageId }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const message = await messageRepository.findById(messageId)
    if (!message) throw new AppError('Tin nhắn không tồn tại', 404)
    if (String(message.senderId) !== String(user._id)) {
        throw new AppError('Không có quyền thu hồi tin nhắn này', 403)
    }
    if (message.isRecalled) throw new AppError('Tin nhắn đã được thu hồi', 400)

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
            io.to(`conv:${message.conversationId}`).emit('message_recalled', {
                messageId: message._id,
                conversationId: message.conversationId,
            })
            io.to(`conv:${message.conversationId}`).emit('message_reaction_updated', {
                conversationId: String(message.conversationId),
                message: populatedMessage,
            })
            io.to(`conv:${message.conversationId}`).emit('message_pin_updated', {
                conversationId: String(message.conversationId),
                message: populatedMessage,
            })
        }
    } catch (e) {
        console.error('Socket emit failed', e)
    }

    return { success: true, messageId: message._id }
}

export const reactToMessage = async ({ token, messageId, emoji }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const message = await messageRepository.findById(messageId)
    if (!message) throw new AppError('Tin nhắn không tồn tại', 404)

    const conversation = await ensureConversationMember({ conversationId: message.conversationId, userId: user._id })

    const chosenEmoji = normalizeEmoji(emoji)
    if (!chosenEmoji) throw new AppError('emoji là bắt buộc', 400)

    const reactionIndex = (message.reactions || []).findIndex((r) => String(r.userId) === String(user._id))
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

    return populatedMessage
}

export const removeMessageReaction = async ({ token, messageId }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const message = await messageRepository.findById(messageId)
    if (!message) throw new AppError('Tin nhắn không tồn tại', 404)

    await ensureConversationMember({ conversationId: message.conversationId, userId: user._id })

    message.reactions = (message.reactions || []).filter((r) => String(r.userId) !== String(user._id))
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

    return populatedMessage
}

export const togglePinMessage = async ({ token, messageId, isPinned }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const message = await messageRepository.findById(messageId)
    if (!message) throw new AppError('Tin nhắn không tồn tại', 404)

    const conversation = await ensureConversationMember({ conversationId: message.conversationId, userId: user._id })

    const shouldPin = parseBoolean(isPinned, true)
    const alreadyPinned = !!message.pinnedAt

    if ((shouldPin && alreadyPinned) || (!shouldPin && !alreadyPinned)) {
        const populatedMessage = await populateMessage(message._id)
        return { message: populatedMessage, conversation }
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

    return { message: populatedMessage, conversation }
}

export const forwardMessage = async ({ token, body }) => {
    if (!token) throw new AppError('Unauthorized', 401)

    const { messageId, targetConversationIds = [], targetUserIds = [] } = body || {}
    if (!messageId) throw new AppError('sourceMessageId hoặc messageId là bắt buộc', 400)

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }

    const sourceMessage = await messageRepository.findById(messageId)
    if (!sourceMessage) throw new AppError('Tin nhắn nguồn không tồn tại', 404)
    if (sourceMessage.isRecalled) throw new AppError('Không thể forward tin nhắn đã thu hồi', 400)

    await ensureConversationMember({ conversationId: sourceMessage.conversationId, userId: user._id })

    const uniqueConversationIds = new Set((targetConversationIds || []).map(String))

    for (const targetUserId of targetUserIds || []) {
        const normalizedTargetUserId = String(targetUserId)
        if (normalizedTargetUserId === String(user._id)) continue

        let directConv = await conversationRepository.findDirectBetweenUsers(String(user._id), normalizedTargetUserId)

        if (!directConv) {
            directConv = await conversationRepository.createDirectConversation({
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
        throw new AppError('Cần ít nhất 1 đích để forward', 400)
    }

    const forwardedMessages = []

    for (const conversationId of uniqueConversationIds) {
        let conversation
        try {
            conversation = await ensureConversationMember({ conversationId, userId: user._id })
        } catch (e) {
            continue
        }

        const newMessage = await messageRepository.createMessage({
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

    return { count: forwardedMessages.length, messages: forwardedMessages }
}
