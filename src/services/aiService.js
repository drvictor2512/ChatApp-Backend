import { GoogleGenAI } from '@google/genai'
import mongoose from 'mongoose'
import { uploadFile } from '../shared/util/fileService.js'
import { getUserByToken } from '../infrastructure/libs/verifyToken.js'
import { AppError } from '../shared/errors/AppError.js'
import {
    conversationRepository,
    messageRepository,
} from '../repository/mongoose/repositories/index.js'

export const AI_BOT_ID = new mongoose.Types.ObjectId('000000000000000000000001')
const AI_BOT_NAME = 'Zting AI Chatbot'
const AI_BOT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Google_Gemini_logo.svg/120px-Google_Gemini_logo.svg.png'
const ALLOWED_KEYWORDS = [
    'học', 'bài tập', 'ôn tập', 'kiến thức', 'code', 'lập trình', 'backend', 'frontend', 'ai', 'database',
    'kỹ năng', 'giao tiếp', 'làm việc nhóm', 'quản lý thời gian', 'công nghệ', 'phát triển', 'mạng', 'bảo mật',
]
const SYSTEM_INSTRUCTION = `
Bạn là một trợ lý AI trong ứng dụng chat.
Bạn CHỈ được phép hỗ trợ các lĩnh vực:
- Học tập
- Công nghệ
- Kỹ năng cá nhân
Quy tắc:
1. Nếu câu hỏi thuộc các lĩnh vực trên → trả lời rõ ràng, hữu ích.
2. Nếu KHÔNG thuộc → từ chối lịch sự:
   "Xin lỗi, tôi chỉ hỗ trợ về học tập, công nghệ, kỹ năng."
3. Nếu người dùng gửi hình ảnh/file:
   → chỉ phân tích nếu nội dung liên quan đến các lĩnh vực trên.
`

const MAX_HISTORY = 20
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const isAllowedTopic = (message) => {
    const msg = String(message || '').toLowerCase()
    return ALLOWED_KEYWORDS.some((keyword) => msg.includes(keyword))
}

const rejectMessage = () => 'Xin lỗi, tôi chỉ hỗ trợ các chủ đề: học tập, công nghệ, kỹ năng.'

const getOrCreateAIConv = async (userId) => {
    let conv = await conversationRepository.findAIConversationByUser(userId)
    if (!conv) {
        conv = await conversationRepository.createDirectConversation({
            type: 'DIRECT',
            isAI: true,
            participants: [{ userId, joinedAt: new Date() }],
            lastMessageAt: new Date(),
        })
    }
    return conv
}

const ensureTokenUser = async (token) => {
    if (!token) throw new AppError('Unauthorized', 401)
    try {
        return await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }
}

export const getAIConversation = async ({ token }) => {
    const user = await ensureTokenUser(token)
    const conv = await getOrCreateAIConv(user._id)
    return { conversation: conv }
}

export const clearAIMessages = async ({ token, conversationId }) => {
    const user = await ensureTokenUser(token)
    if (!conversationId) throw new AppError('conversationId required', 400)

    const conv = await conversationRepository.findAIConversationByIdForUser(conversationId, user._id)
    if (!conv) throw new AppError('Conversation not found', 404)

    await messageRepository.deleteManyByConversationId(conversationId)

    conv.lastMessage = null
    conv.lastMessageAt = new Date()
    await conv.save()

    return { message: 'Đã xoá lịch sử chat AI' }
}

export const getAIMessages = async ({ token, conversationId, limit = 20, before }) => {
    const user = await ensureTokenUser(token)
    if (!conversationId) throw new AppError('conversationId required', 400)

    const conv = await conversationRepository.findAIConversationByIdForUser(conversationId, user._id)
    if (!conv) throw new AppError('Conversation not found', 404)

    const query = { conversationId }
    if (before) query.createdAt = { $lt: new Date(before) }

    const messages = await messageRepository.findMessages(query, {
        sort: { createdAt: -1 },
        limit: Number(limit),
    }).lean()

    const enriched = messages.reverse().map((m) => {
        if (String(m.senderId) === String(AI_BOT_ID)) {
            return { ...m, senderId: { _id: AI_BOT_ID, name: AI_BOT_NAME, avatarUrl: AI_BOT_AVATAR } }
        }
        return { ...m, senderId: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl } }
    })

    return { messages: enriched }
}

export const handleAIMessage = async (socket, { token, content, file } = {}) => {
    if (!token) {
        socket.emit('ai_error', { message: 'Unauthorized' })
        return
    }

    let user
    try {
        user = await getUserByToken(token)
    } catch (e) {
        socket.emit('ai_error', { message: e.message })
        return
    }

    if (!content && !file) {
        socket.emit('ai_error', { message: 'Tin nhắn không được để trống' })
        return
    }

    const conv = await getOrCreateAIConv(user._id)

    let fileUrl
    if (file) {
        const buffer = Buffer.from(file.data, 'base64')
        const ext = (file.mimeType || 'application/octet-stream').split('/')[1] || 'bin'
        fileUrl = await uploadFile({ buffer, mimetype: file.mimeType, originalname: `upload.${ext}` })
    }

    const userMessage = await messageRepository.createMessage({
        conversationId: conv._id,
        senderId: user._id,
        content: content || null,
        fileUrl: fileUrl || null,
    })

    const userMsgEnriched = {
        ...userMessage.toObject(),
        senderId: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl },
    }
    socket.emit('ai_user_message', { message: userMsgEnriched })

    if (!content || !isAllowedTopic(content)) {
        const rejectText = rejectMessage()
        socket.emit('ai_chunk', { text: rejectText })
        const aiMessage = await messageRepository.createMessage({
            conversationId: conv._id,
            senderId: AI_BOT_ID,
            content: rejectText,
        })
        const aiMsgEnriched = {
            ...aiMessage.toObject(),
            senderId: { _id: AI_BOT_ID, name: AI_BOT_NAME, avatarUrl: AI_BOT_AVATAR },
        }
        socket.emit('ai_done', { message: aiMsgEnriched })
        return
    }

    const history = await messageRepository
        .findMessages({ conversationId: conv._id, _id: { $ne: userMessage._id } }, {
            sort: { createdAt: -1 },
            limit: MAX_HISTORY,
        })
        .lean()

    history.reverse()

    const contents = []
    for (const msg of history) {
        const role = String(msg.senderId) === String(AI_BOT_ID) ? 'model' : 'user'
        const parts = []
        if (msg.content) parts.push({ text: msg.content })
        if (msg.fileUrl && !msg.content) parts.push({ text: '[File đính kèm]' })
        if (parts.length === 0) continue
        contents.push({ role, parts })
    }

    const currentParts = []
    if (content) currentParts.push({ text: content })
    if (file) currentParts.push({ inlineData: { data: file.data, mimeType: file.mimeType } })
    if (currentParts.length > 0) contents.push({ role: 'user', parts: currentParts })

    try {
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        })

        let fullText = ''
        for await (const chunk of stream) {
            const text = chunk.text
            if (text) {
                fullText += text
                socket.emit('ai_chunk', { text })
            }
        }

        if (!fullText) fullText = 'Xin lỗi, tôi không thể trả lời lúc này.'

        const aiMessage = await messageRepository.createMessage({
            conversationId: conv._id,
            senderId: AI_BOT_ID,
            content: fullText,
        })

        conv.lastMessage = { content: fullText, senderId: AI_BOT_ID, createdAt: aiMessage.createdAt }
        conv.lastMessageAt = aiMessage.createdAt
        await conv.save()

        const aiMsgEnriched = {
            ...aiMessage.toObject(),
            senderId: { _id: AI_BOT_ID, name: AI_BOT_NAME, avatarUrl: AI_BOT_AVATAR },
        }
        socket.emit('ai_done', { message: aiMsgEnriched })
    } catch (err) {
        console.error('handleAIMessage error:', err)
        socket.emit('ai_error', { message: err.message || 'Lỗi hệ thống' })
    }
}
