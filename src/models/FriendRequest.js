import mongoose from 'mongoose';

const friendRequestSchema = new mongoose.Schema({
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, maxlength: 300 },
}, { timestamps: true });
// Đảm bảo không có hai yêu cầu kết bạn giống nhau giữa cùng hai người dùng.
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
// Truy vấn nhanh tất cả các lời mời đã gửi
friendRequestSchema.index({ fromUserId: 1 });
// Truy vấn nhanh tất cả các lời mời đã nhận
friendRequestSchema.index({ toUserId: 1 });
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);
export default FriendRequest;