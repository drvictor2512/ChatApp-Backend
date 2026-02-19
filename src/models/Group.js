import mongoose from 'mongoose';
import crypto from 'crypto';

const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deputyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inviteCode: { type: String, unique: true, sparse: true },
}, { timestamps: true });

const Group = mongoose.model('Group', groupSchema);
export default Group;