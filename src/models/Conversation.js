import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['Trưởng nhóm', 'Phó nhóm', 'Thành viên'], default: 'Thành viên' },
}, { _id: false })
const lastMessageSub = new mongoose.Schema({
    content: { type: String },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    participants: [participantSchema],
    type: { type: String, enum: ['DIRECT', 'GROUP'], default: 'DIRECT' },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    lastMessageAt: { type: Date },
    lastMessage: lastMessageSub,
    unreadCounts: { type: Map, of: Number },
    isAI: { type: Boolean, default: false },
}, { timestamps: true });

// Tạo index để tối ưu truy vấn cuộc trò chuyện theo người tham gia và thời gian tin nhắn cuối cùng
conversationSchema.index({ 'participants.userId': 1, lastMessageAt: -1 });
const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;