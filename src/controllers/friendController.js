import User from "../models/User.js";
import { getUserByToken } from '../libs/verifyToken.js';
import Friend from './../models/Friend.js';
import FriendRequest from './../models/FriendRequest.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import { getIo } from '../libs/socket.js'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}

export const sendFriendRequest = async (req, res) => {
    try {
        const { to, message } = req.body;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const from = user._id

        // Không thể gửi yêu cầu kết bạn cho chính mình
        if (from.toString() === to.toString()) {
            return res.status(400).json({ message: 'Không thể gửi yêu cầu kết bạn cho chính mình' });
        }
        // Kiểm tra người dùng đích có tồn tại không
        const existingUser = await User.exists({ _id: to });
        if (!existingUser) {
            return res.status(404).json({ message: 'Người dùng không tồn tại' });
        }
        // Kiểm tra đã là bạn bè hoặc đã gửi yêu cầu kết bạn trước đó
        let userA = from.toString()
        let userB = to.toString()
        if (userA > userB) {
            [userA, userB] = [userB, userA]
        }
        const [alreadyFriends, existingRequest] = await Promise.all([
            Friend.findOne({ userIdA: userA, userIdB: userB }),
            FriendRequest.findOne({
                $or: [
                    { fromUserId: from, toUserId: to },
                    { fromUserId: to, toUserId: from }
                ]
            })
        ])
        if (alreadyFriends) {
            return res.status(400).json({ message: 'Hai người đã là bạn bè' });
        }
        if (existingRequest) {
            return res.status(400).json({ message: 'Yêu cầu kết bạn đã được gửi trước đó' });
        }

        // Tạo yêu cầu kết bạn mới
        const request = await FriendRequest.create({ fromUserId: from, toUserId: to, message });
        const populatedRequest = await FriendRequest.findById(request._id)
            .populate('fromUserId', '_id name avatarUrl email')
            .populate('toUserId', '_id name avatarUrl email')
            .lean()
        try {
            const io = getIo()
            if (io) io.to(`user:${to}`).emit('friend_request', { request: populatedRequest })
        } catch (e) { }
        res.status(200).json({ message: 'Đã gửi yêu cầu kết bạn', request: populatedRequest });
    } catch (error) {
        console.error('Lỗi khi thêm bạn:', error);
        res.status(500).json({ message: error.message });
    }
}
export const acceptFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        // Tìm yêu cầu kết bạn theo ID
        const request = await FriendRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Yêu cầu kết bạn không tồn tại' });
        }
        // Chỉ người nhận yêu cầu mới có thể chấp nhận
        if (request.toUserId.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Bạn không có quyền chấp nhận yêu cầu kết bạn này' });
        }
        // Tạo mối quan hệ bạn bè
        const friend = await Friend.create({
            userIdA: request.fromUserId,
            userIdB: request.toUserId
        })
        // Xóa yêu cầu kết bạn sau khi chấp nhận
        await FriendRequest.findByIdAndDelete(requestId);
        // Trả về thông tin bạn bè mới
        const from = await User.findById(request.fromUserId).select('_id email name avatarUrl').lean();
        const toUser = await User.findById(request.toUserId).select('_id email name avatarUrl').lean();

        // Tự động tạo hội thoại trực tiếp ngay khi hai người trở thành bạn bè.
        let conversation = await Conversation.findOne({
            type: 'DIRECT',
            'participants.userId': { $all: [request.fromUserId, request.toUserId] },
            $expr: { $eq: [{ $size: '$participants' }, 2] }
        });

        const friendshipSystemContent = `${from?.name || 'Bạn'} và ${toUser?.name || 'Bạn'} đã trở thành bạn bè`;

        if (!conversation) {
            conversation = new Conversation({
                type: 'DIRECT',
                participants: [{ userId: request.fromUserId }, { userId: request.toUserId }],
            });
        }

        const systemMessage = await Message.create({
            conversationId: conversation._id,
            senderId: request.fromUserId,
            content: friendshipSystemContent,
            isSystem: true,
        });

        conversation.lastMessage = {
            _id: systemMessage._id,
            content: systemMessage.content,
            senderId: request.fromUserId,
            createdAt: systemMessage.createdAt,
        };
        conversation.lastMessageAt = systemMessage.createdAt;
        await conversation.save();

        await conversation.populate([
            { path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' },
            { path: 'lastMessage.senderId', select: 'name avatarUrl email' },
        ]);

        const populatedSystemMessage = await Message.findById(systemMessage._id)
            .populate('senderId', 'name avatarUrl email');

        try {
            const io = getIo()
            if (io) {
                io.to(`user:${request.fromUserId}`).emit('friend_accepted', { friend: toUser, conversation })
                io.to(`user:${request.toUserId}`).emit('friend_accepted', { friend: from, conversation })
                io.to(`user:${request.fromUserId}`).emit('new_message', populatedSystemMessage)
                io.to(`user:${request.toUserId}`).emit('new_message', populatedSystemMessage)
            }
        } catch (e) { }
        res.status(200).json({
            message: 'Đã chấp nhận yêu cầu kết bạn', newFriend: {
                _id: from?._id, email: from?.email, name: from?.name, avatarUrl: from?.avatarUrl
            },
            conversation
        });
    } catch (error) {
        console.error('Lỗi khi chấp nhận kết bạn:', error);
        res.status(500).json({ message: error.message });
    }
}
export const declineFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        const request = await FriendRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Yêu cầu kết bạn không tồn tại' });
        }
        if (request.toUserId.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Bạn không có quyền từ chối yêu cầu kết bạn này' });
        }
        // Xóa yêu cầu kết bạn
        const senderId = request.fromUserId
        await FriendRequest.findByIdAndDelete(requestId);
        try {
            const io = getIo()
            if (io) io.to(`user:${senderId}`).emit('friend_declined', { requestId })
        } catch (e) { }
        res.status(200).json({ message: 'Đã từ chối yêu cầu kết bạn' });
    } catch (error) {
        console.error('Lỗi khi từ chối kết bạn:', error);
        res.status(500).json({ message: error.message });
    }
}
export const getAllFriends = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        const friendships = await Friend.find({
            $or: [{ userIdA: userId }, { userIdB: userId }]
        }).populate("userIdA userIdB", "_id email name avatarUrl").lean();
        // Kiểm tra nếu không có bạn bè
        if (!friendships || friendships.length === 0) {
            return res.status(200).json({ friends: [] });
        }
        // Lấy danh sách bạn bè
        const friends = friendships.map(f => f.userIdA._id.toString() === userId.toString() ? f.userIdB : f.userIdA);
        res.status(200).json({ friends });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách bạn bè:', error);
        res.status(500).json({ message: error.message });
    }
}
export const getFriendsRequest = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        const populateFields = '_id email name avatarUrl';
        const [sent, receive] = await Promise.all([
            FriendRequest.find({ fromUserId: userId }).populate('toUserId', populateFields).lean(),
            FriendRequest.find({ toUserId: userId }).populate('fromUserId', populateFields).lean()
        ])
        res.status(200).json({ sent, receive });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách yêu cầu kết bạn:', error);
        res.status(500).json({ message: error.message });
    }
}
export const unfriend = async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        if (userId.toString() === otherUserId.toString()) {
            return res.status(400).json({ message: 'Không thể huỷ kết bạn với chính mình' });
        }

        let userA = userId.toString();
        let userB = otherUserId.toString();
        if (userA > userB) {
            [userA, userB] = [userB, userA]
        }

        const deleted = await Friend.findOneAndDelete({ userIdA: userA, userIdB: userB });
        if (!deleted) {
            return res.status(404).json({ message: 'Bạn không phải là bạn của người này' });
        }
        try {
            const io = getIo()
            if (io) io.to(`user:${otherUserId}`).emit('unfriended', { userId: userId.toString() })
        } catch (e) { }
        res.status(200).json({ message: 'Đã huỷ kết bạn' });
    } catch (error) {
        console.error('Lỗi khi huỷ bạn:', error);
        res.status(500).json({ message: error.message });
    }
}