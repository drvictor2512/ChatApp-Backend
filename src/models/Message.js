import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    reactedAt: { type: Date, default: Date.now },
}, { _id: false });

const forwardedFromSchema = new mongoose.Schema({
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    originalSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    originalConversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
}, { _id: false });

const messageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    fileUrl: { type: String },
    fileUrls: [{ type: String }],
    content: { type: String },
    isRecalled: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    reactions: { type: [reactionSchema], default: [] },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isForwarded: { type: Boolean, default: false },
    forwardedFrom: { type: forwardedFromSchema, default: null },
}, { timestamps: true });
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, pinnedAt: -1 });
const Message = mongoose.model('Message', messageSchema);
export default Message;