import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['Nam', 'Nữ'] },
    avatarUrl: { type: String },
    bannerUrl: { type: String },
    bio: { type: String },
    lastSeen: { type: Date },
    verified: { type: Boolean, default: false },
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
export default User

