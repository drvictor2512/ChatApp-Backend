import mongoose from 'mongoose';

const lastMessageSub = new mongoose.Schema({
    content: { type: String },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    type: { type: String, enum: ['PRIVATE', 'GROUP'], default: 'PRIVATE' },
    seenByUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    lastMessage: lastMessageSub,
    unreadCounts: { type: Map, of: Number },
}, { timestamps: true });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;