import { GoogleGenAI } from '@google/genai';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { uploadFile } from '../util/fileService.js';
import { getUserByToken } from '../libs/verifyToken.js';

// Định nghĩa một ObjectId cố định cho bot AI để dễ dàng nhận diện trong DB
export const AI_BOT_ID = new mongoose.Types.ObjectId('000000000000000000000001');
const AI_BOT_NAME = 'Zting AI Chatbot';
const AI_BOT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Google_Gemini_logo.svg/120px-Google_Gemini_logo.svg.png';
const ALLOWED_KEYWORDS = [
    "học", "bài tập", "ôn tập", "kiến thức", "code", "lập trình", "backend", "frontend", "ai", "database",
    "kỹ năng", "giao tiếp", "làm việc nhóm", "quản lý thời gian", "công nghệ", "phát triển", "mạng", "bảo mật"
];
function isAllowedTopic(message) {
    const msg = message.toLowerCase();

    return ALLOWED_KEYWORDS.some(keyword => msg.includes(keyword));
}
function rejectMessage() {
    return "Xin lỗi, tôi chỉ hỗ trợ các chủ đề: học tập, công nghệ, kỹ năng.";
}
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
`;

const MAX_HISTORY = 20;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
};

// Tìm hoặc tạo cuộc trò chuyện AI cho người dùng
async function getOrCreateAIConv(userId) {
    let conv = await Conversation.findOne({ 'participants.userId': userId, isAI: true });
    if (!conv) {
        conv = await Conversation.create({
            type: 'DIRECT',
            isAI: true,
            participants: [{ userId, joinedAt: new Date() }],
            lastMessageAt: new Date(),
        });
    }
    return conv;
}

// GET Lấy hoặc tạo cuộc trò chuyện AI cho người dùng đã đăng nhập
export const getAIConversation = async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await getOrCreateAIConv(user._id);
        return res.status(200).json({ conversation: conv });
    } catch (err) {
        console.error('getAIConversation error:', err);
        return res.status(500).json({ message: err.message });
    }
};

// DELETE Xoá toàn bộ tin nhắn trong cuộc trò chuyện AI (làm mới)
export const clearAIMessages = async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const { conversationId } = req.query;
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' });

        const conv = await Conversation.findOne({ _id: conversationId, isAI: true, 'participants.userId': user._id });
        if (!conv) return res.status(404).json({ message: 'Conversation not found' });

        await Message.deleteMany({ conversationId });

        conv.lastMessage = null;
        conv.lastMessageAt = new Date();
        await conv.save();

        return res.status(200).json({ message: 'Đã xoá lịch sử chat AI' });
    } catch (err) {
        console.error('clearAIMessages error:', err);
        return res.status(500).json({ message: err.message });
    }
};

// GET Lấy danh sách tin nhắn trong cuộc trò chuyện AI, có phân trang theo thời gian
export const getAIMessages = async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const { conversationId, limit = 20, before } = req.query;
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' });

        // Verify ownership
        const conv = await Conversation.findOne({ _id: conversationId, isAI: true, 'participants.userId': user._id });
        if (!conv) return res.status(404).json({ message: 'Conversation not found' });

        const query = { conversationId };
        if (before) query.createdAt = { $lt: new Date(before) };

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .lean();

        const enriched = messages.reverse().map(m => {
            if (String(m.senderId) === String(AI_BOT_ID)) {
                return { ...m, senderId: { _id: AI_BOT_ID, name: AI_BOT_NAME, avatarUrl: AI_BOT_AVATAR } };
            }
            return { ...m, senderId: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl } };
        });

        return res.status(200).json({ messages: enriched });
    } catch (err) {
        console.error('getAIMessages error:', err);
        return res.status(500).json({ message: err.message });
    }
};

// Xử lý tin nhắn AI qua Socket.IO, streaming phản hồi từng chunk, lưu lịch sử
export const handleAIMessage = async (socket, { token, content, file } = {}) => {
    if (!token) {
        socket.emit('ai_error', { message: 'Unauthorized' });
        return;
    }
    let user;
    try { user = await getUserByToken(token); } catch (e) {
        socket.emit('ai_error', { message: e.message });
        return;
    }

    if (!content && !file) {
        socket.emit('ai_error', { message: 'Tin nhắn không được để trống' });
        return;
    }

    const conv = await getOrCreateAIConv(user._id);

    // Nếu có file (base64), upload lên storage
    let fileUrl;
    if (file) {
        const buffer = Buffer.from(file.data, 'base64');
        const ext = (file.mimeType || 'application/octet-stream').split('/')[1] || 'bin';
        fileUrl = await uploadFile({ buffer, mimetype: file.mimeType, originalname: `upload.${ext}` });
    }
    // Lưu tin nhắn người dùng vào DB
    const userMessage = await Message.create({
        conversationId: conv._id,
        senderId: user._id,
        content: content || null,
        fileUrl: fileUrl || null,
    });

    const userMsgEnriched = {
        ...userMessage.toObject(),
        senderId: { _id: user._id, name: user.name, avatarUrl: user.avatarUrl },
    };
    socket.emit('ai_user_message', { message: userMsgEnriched });
    // FILTER KEYWORD 
    if (!content || !isAllowedTopic(content)) {
        const rejectText = rejectMessage();
        socket.emit('ai_chunk', { text: rejectText });
        const aiMessage = await Message.create({
            conversationId: conv._id,
            senderId: AI_BOT_ID,
            content: rejectText,
        });
        const aiMsgEnriched = {
            ...aiMessage.toObject(),
            senderId: { _id: AI_BOT_ID, name: AI_BOT_NAME, avatarUrl: AI_BOT_AVATAR },
        };
        socket.emit('ai_done', { message: aiMsgEnriched });
        return;
    }
    // Lấy lịch sử để làm ngữ cảnh
    const history = await Message.find({ conversationId: conv._id, _id: { $ne: userMessage._id } })
        .sort({ createdAt: -1 }).limit(MAX_HISTORY).lean();
    history.reverse();

    const contents = [];
    for (const msg of history) {
        const role = String(msg.senderId) === String(AI_BOT_ID) ? 'model' : 'user';
        const parts = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.fileUrl && !msg.content) parts.push({ text: '[File đính kèm]' });
        if (parts.length === 0) continue;
        contents.push({ role, parts });
    }

    const currentParts = [];
    if (content) currentParts.push({ text: content });
    if (file) currentParts.push({ inlineData: { data: file.data, mimeType: file.mimeType } });
    if (currentParts.length > 0) contents.push({ role: 'user', parts: currentParts });

    try {
        // Stream từng chunk từ Gemini và phát qua socket
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents,
            config: { systemInstruction: SYSTEM_INSTRUCTION },
        });

        let fullText = '';
        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
                fullText += text;
                socket.emit('ai_chunk', { text });
            }
        }

        if (!fullText) fullText = 'Xin lỗi, tôi không thể trả lời lúc này.';

        // Lưu phản hồi AI vào DB
        const aiMessage = await Message.create({
            conversationId: conv._id,
            senderId: AI_BOT_ID,
            content: fullText,
        });

        conv.lastMessage = { content: fullText, senderId: AI_BOT_ID, createdAt: aiMessage.createdAt };
        conv.lastMessageAt = aiMessage.createdAt;
        await conv.save();

        const aiMsgEnriched = {
            ...aiMessage.toObject(),
            senderId: { _id: AI_BOT_ID, name: AI_BOT_NAME, avatarUrl: AI_BOT_AVATAR },
        };
        socket.emit('ai_done', { message: aiMsgEnriched });
    } catch (err) {
        console.error('handleAIMessage error:', err);
        socket.emit('ai_error', { message: err.message || 'Lỗi hệ thống' });
    }
};
