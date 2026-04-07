import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['Trưởng nhóm', 'Phó nhóm', 'Thành viên'], default: 'Thành viên' },
}, { _id: false })

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deputyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inviteCode: { type: String },
}, { _id: false });

const lastMessageSub = new mongoose.Schema({
    content: { type: String },
    fileUrl: { type: String },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    participants: [participantSchema],
    type: { type: String, enum: ['DIRECT', 'GROUP'], default: 'DIRECT' },
    group: { type: groupSchema, required: false },
    lastMessageAt: { type: Date },
    lastMessage: lastMessageSub,
    unreadCounts: { type: Map, of: Number },
    isAI: { type: Boolean, default: false },
}, { timestamps: true });

// Tạo index để tối ưu truy vấn cuộc trò chuyện theo người tham gia và thời gian tin nhắn cuối cùng
conversationSchema.index({ 'participants.userId': 1, lastMessageAt: -1 });
conversationSchema.index(
    { 'group.inviteCode': 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: {
            type: 'GROUP',
            'group.inviteCode': { $exists: true, $type: 'string' },
        },
    }
);
const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;