import mongoose from 'mongoose';

const friendSchema = new mongoose.Schema({
    userIdA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userIdB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Đảm bảo userIdB luôn nhỏ hơn userIdA để tránh trùng lặp các cặp bạn bè.
friendSchema.pre("save", function () {
    const a = this.userIdA.toString();
    const b = this.userIdB.toString();
    if (a > b) {
        this.userIdA = new mongoose.Types.ObjectId(b);
        this.userIdB = new mongoose.Types.ObjectId(a);
    }
})
// Tạo index để tối ưu truy vấn bạn bè và đảm bảo không có cặp bạn bè trùng lặp
friendSchema.index({ userIdA: 1, userIdB: 1 }, { unique: true })
const Friend = mongoose.model('Friend', friendSchema);
export default Friend;
