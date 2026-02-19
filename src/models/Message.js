import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    fileUrl: { type: String },
    content: { type: String },
    isRecalled: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
}, { timestamps: true });
messageSchema.index({ conversationId: 1, createdAt: -1 });
const Message = mongoose.model('Message', messageSchema);
export default Message;