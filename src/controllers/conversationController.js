import Conversation from "../models/Conversation.js";
import { getUserByToken } from '../libs/verifyToken.js';
import User from "../models/User.js";
import Message from './../models/Message.js';
import Group from '../models/Group.js';
import Friend from '../models/Friend.js'
import { getIo } from '../libs/socket.js'
import crypto from 'crypto'

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || ''
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
}
export const createConversation = async (req, res) => {
    try {
        const { type, name, memberIds } = req.body;
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        // Kiểm tra dữ liệu đầu vào
        if (!type || (type === 'GROUP' && !name) || !memberIds || !Array.isArray(memberIds)
            || memberIds.length === 0) {
            return res.status(400).json({ message: 'Tên nhóm và danh sách thành viên là bắt buộc' })
        }
        let conversation
        if (type === 'DIRECT') {
            const participantId = memberIds[0];
            conversation = await Conversation.findOne({
                type: 'DIRECT',
                "participants.userId": { $all: [userId, participantId] },
            })
            if (!conversation) {
                conversation = new Conversation({
                    type: 'DIRECT',
                    participants: [{ userId }, { userId: participantId }],
                    lastMessageAt: new Date(),
                })
            }
            await conversation.save();
        }
        if (type === 'GROUP') {
            // Tạo nhóm mới
            // Kiểm tra tất cả memberIds có phải là bạn của userId hay không
            const notFriends = []
            for (const mid of memberIds) {
                if (String(mid) === String(userId)) continue
                let a = String(userId)
                let b = String(mid)
                if (a > b) [a, b] = [b, a]
                const exists = await Friend.findOne({ userIdA: a, userIdB: b })
                if (!exists) notFriends.push(mid)
            }
            if (notFriends.length > 0) {
                return res.status(400).json({ message: 'Một hoặc nhiều thành viên chưa là bạn. Chỉ có thể thêm bạn bè vào nhóm', notFriends })
            }

            const group = new Group({
                name,
                ownerId: userId,
                deputyIds: [],
                createdBy: userId,
            })
            await group.save();

            // Xây dựng danh sách thành viên: bao gồm các memberIds yêu cầu và người tạo (nếu chưa có)
            const members = Array.from(new Set([...(memberIds || []), String(userId)])).map(id => ({ userId: id, joinedAt: new Date(), role: String(id) === String(userId) ? 'Trưởng nhóm' : 'Thành viên' }));

            conversation = new Conversation({
                type: 'GROUP',
                groupId: group._id,
                participants: members,
                lastMessageAt: new Date(),
                unreadCounts: new Map()
            })
            await conversation.save();

            // Tạo system message
            const sysMsg = await Message.create({ conversationId: conversation._id, senderId: userId, content: `${user.name} đã tạo nhóm`, isSystem: true })
            conversation.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: userId, createdAt: sysMsg.createdAt }
            conversation.lastMessageAt = sysMsg.createdAt
            await conversation.save()
        }
        if (!conversation) {
            return res.status(400).json({ message: 'Loại cuộc trò chuyện không hợp lệ' })
        }
        await conversation.populate([
            { path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' },
            { path: 'lastMessage.senderId', select: 'name avatarUrl email' },
            { path: 'groupId', select: 'name ownerId deputyIds' },
        ])
        return res.status(201).json(conversation)
    } catch (error) {
        console.error('Lỗi khi tạo cuộc trò chuyện:', error)
        return res.status(500).json({ message: error.message })
    }
}

export const getConversations = async (req, res) => {
    try {
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = user._id;
        const conversations = await Conversation.find({
            "participants.userId": userId
        })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .populate([{ path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' }])
            .populate([{ path: 'lastMessage.senderId', select: 'name avatarUrl email' }])
            .populate([{ path: 'groupId', select: 'name ownerId deputyIds' }]);

        const formatted = conversations.map(conv => {
            const participants = (conv.participants || []).map(p => ({
                _id: p.userId?._id,
                name: p.userId?.name,
                avatarUrl: p.userId?.avatarUrl ?? null,
                email: p.userId?.email ?? null,
                dateOfBirth: p.userId?.dateOfBirth ?? null,
                gender: p.userId?.gender ?? null,
                bannerUrl: p.userId?.bannerUrl ?? null,
                bio: p.userId?.bio ?? null,
                verified: p.userId?.verified ?? null,
                createdAt: p.userId?.createdAt ?? null,
                joinedAt: p.joinedAt,
                role: p.role,
            }))
            return {
                ...conv.toObject(),
                unreadCounts: conv.unreadCounts || {},
                participants,
            }
        })
        return res.status(200).json({ conversations: formatted })
    } catch (error) {
        console.error('Lỗi khi lấy danh sách cuộc trò chuyện:', error)
        return res.status(500).json({ message: error.message })
    }
}

export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, cursor } = req.query;
        const query = { conversationId };

        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) }
        }
        let messages = await Message.find(query).sort({ createdAt: -1 }).limit(Number(limit) + 1).populate({ path: 'senderId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' })
        let nextCursor = null;
        if (messages.length > Number(limit)) {
            const nextMessage = messages[messages.length - 1];
            nextCursor = nextMessage.createdAt.toISOString();
            messages.pop();
        }
        messages = messages.reverse();
        return res.status(200).json({ messages, nextCursor })

    } catch (error) {
        console.error('Lỗi khi lấy tin nhắn:', error)
        return res.status(500).json({ message: error.message })
    }
}

// Group
export const renameGroup = async (req, res) => {
    try {
        const { conversationId, name } = req.body
        if (!conversationId || !name) return res.status(400).json({ message: 'conversationId and name required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        // Kiểm tra permission: chỉ trưởng nhóm và phó nhóm mới có quyền đổi tên nhóm
        const participant = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        if (!participant) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' })
        if (!(participant.role === 'Trưởng nhóm' || participant.role === 'Phó nhóm')) return res.status(403).json({ message: 'Không đủ quyền' })

        await Group.findByIdAndUpdate(conv.groupId._id, { name }).exec()

        // Tạo system message và emit socket để client cập nhật ngay
        try {
            const sysMsg = await Message.create({ conversationId, senderId: user._id, content: `${user.name} đã đổi tên nhóm thành ${name}`, isSystem: true })
            conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
            conv.lastMessageAt = sysMsg.createdAt
            await conv.save()
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conversationId}`).emit('new_message', populatedMsg)
                io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
            }
        } catch (e) { console.error('system message / emit failed', e) }

        return res.status(200).json({ message: 'Đổi tên nhóm thành công' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const addGroupMember = async (req, res) => {
    try {
        const { conversationId, memberId } = req.body
        if (!conversationId || !memberId) return res.status(400).json({ message: 'conversationId and memberId required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId)
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        // Bất kỳ thành viên nào cũng có thể thêm thành viên mới.
        const isMember = (conv.participants || []).some(p => String(p.userId) === String(user._id))
        if (!isMember) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' })

        // enforce friendship: adder must be friend with memberId (unless adding self)
        if (String(memberId) !== String(user._id)) {
            let a = String(user._id)
            let b = String(memberId)
            if (a > b) [a, b] = [b, a]
            const exists = await Friend.findOne({ userIdA: a, userIdB: b })
            if (!exists) return res.status(400).json({ message: 'Chỉ có thể thêm bạn bè vào nhóm' })
        }

        // Không thể thêm thành viên đã có trong nhóm
        if ((conv.participants || []).some(p => String(p.userId) === String(memberId))) return res.status(400).json({ message: 'Đã là thành viên' })

        conv.participants.push({ userId: memberId, joinedAt: new Date(), role: 'Thành viên' })
        await conv.save()

        // Tạo system message
        const addedUser = await User.findById(memberId).select('name').lean()
        const sysMsg = await Message.create({ conversationId, senderId: user._id, content: `${user.name} đã thêm ${addedUser?.name || 'thành viên'} vào nhóm`, isSystem: true })
        conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
        conv.lastMessageAt = sysMsg.createdAt
        await conv.save()

        // emit group update so clients refresh
        try {
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conversationId}`).emit('new_message', populatedMsg)
                io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
            }
        } catch (e) { console.error('emit group_updated failed', e) }

        return res.status(200).json({ message: 'Đã thêm thành viên' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const removeGroupMember = async (req, res) => {
    try {
        const { conversationId, memberId } = req.body
        if (!conversationId || !memberId) return res.status(400).json({ message: 'conversationId and memberId required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        const actor = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        if (!actor) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' })

        // Trưởng nhóm và phó nhóm có quyền xoá thành viên
        if (!(actor.role === 'Trưởng nhóm' || actor.role === 'Phó nhóm')) return res.status(403).json({ message: 'Không đủ quyền' })

        // Không thể xoá thành viên không tồn tại trong nhóm
        const target = (conv.participants || []).find(p => String(p.userId) === String(memberId))
        if (!target) return res.status(404).json({ message: 'Thành viên không tìm thấy' })
        // Không thể xoá trưởng nhóm
        if (target.role === 'Trưởng nhóm') return res.status(400).json({ message: 'Không thể xóa trưởng nhóm' })

        conv.participants = (conv.participants || []).filter(p => String(p.userId) !== String(memberId))
        await conv.save()
        // also remove from group deputyIds if present
        await Group.findByIdAndUpdate(conv.groupId._id, { $pull: { deputyIds: memberId } }).exec()

        // system message
        try {
            const removedUser = await User.findById(memberId).select('name').lean()
            const sysMsg = await Message.create({ conversationId, senderId: user._id, content: `${user.name} đã xoá ${removedUser?.name || 'thành viên'} khỏi nhóm`, isSystem: true })
            conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
            conv.lastMessageAt = sysMsg.createdAt
            await conv.save()
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conversationId}`).emit('new_message', populatedMsg)
                io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
            }
        } catch (e) { console.error('system message / emit failed', e) }

        return res.status(200).json({ message: 'Đã xóa thành viên' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const assignDeputy = async (req, res) => {
    try {
        const { conversationId, memberId, action } = req.body // action: 'assign' | 'remove'
        if (!conversationId || !memberId || !action) return res.status(400).json({ message: 'conversationId, memberId and action required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        const actor = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        if (!actor || actor.role !== 'Trưởng nhóm') return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền này' })

        const target = (conv.participants || []).find(p => String(p.userId) === String(memberId))
        if (!target) return res.status(404).json({ message: 'Thành viên không tìm thấy' })

        if (action === 'assign') {
            // set deputy in group and participant role
            await Group.findByIdAndUpdate(conv.groupId._id, { $addToSet: { deputyIds: memberId } }).exec()
            conv.participants = conv.participants.map(p => ({ ...p.toObject ? p.toObject() : p, role: String(p.userId) === String(memberId) ? 'Phó nhóm' : p.role }))
        } else if (action === 'remove') {
            await Group.findByIdAndUpdate(conv.groupId._id, { $pull: { deputyIds: memberId } }).exec()
            conv.participants = conv.participants.map(p => ({ ...p.toObject ? p.toObject() : p, role: String(p.userId) === String(memberId) ? 'Thành viên' : p.role }))
        } else {
            return res.status(400).json({ message: 'action must be assign or remove' })
        }
        await conv.save()

        // system message + emit
        try {
            const targetUser = await User.findById(memberId).select('name').lean()
            const msgContent = action === 'assign'
                ? `${targetUser?.name || 'Thành viên'} đã được bổ nhiệm làm phó nhóm`
                : `${targetUser?.name || 'Thành viên'} đã bị thu hồi quyền phó nhóm`
            const sysMsg = await Message.create({ conversationId, senderId: user._id, content: msgContent, isSystem: true })
            conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
            conv.lastMessageAt = sysMsg.createdAt
            await conv.save()
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conversationId}`).emit('new_message', populatedMsg)
                io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
            }
        } catch (e) { console.error('system message / emit failed', e) }

        return res.status(200).json({ message: 'Đã cập nhật quyền phó nhóm' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const deleteGroup = async (req, res) => {
    try {
        const { conversationId } = req.params
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })
        const actor = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        if (!actor || actor.role !== 'Trưởng nhóm') return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền xóa nhóm' })

        // emit group update (deletion)
        try {
            const io = getIo()
            if (io) io.to(`conv:${conversationId}`).emit('group_updated', { conversationId, deleted: true })
        } catch (e) { console.error('emit group_updated failed', e) }

        // delete conversation and group
        await Conversation.findByIdAndDelete(conversationId).exec()
        await Group.findByIdAndDelete(conv.groupId._id).exec()
        return res.status(200).json({ message: 'Đã xóa nhóm' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const leaveGroup = async (req, res) => {
    try {
        const { conversationId } = req.body
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group conversation not found' })

        const participant = (conv.participants || []).find(p => String(p.userId) === String(user._id) || String(p._id) === String(user._id))
        if (!participant) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' })

        // Owner cannot leave — must delete group or transfer ownership
        if (participant.role === 'Trưởng nhóm') return res.status(400).json({ message: 'Trưởng nhóm không thể rời nhóm' })

        // remove participant
        conv.participants = (conv.participants || []).filter(p => !(String(p.userId) === String(user._id) || String(p._id) === String(user._id)))
        await conv.save()

        // also remove from group deputyIds if present
        if (conv.groupId && conv.groupId._id) {
            await Group.findByIdAndUpdate(conv.groupId._id, { $pull: { deputyIds: user._id } }).exec()
        }

        // system message + emit
        try {
            const sysMsg = await Message.create({ conversationId, senderId: user._id, content: `${user.name} đã rời khỏi nhóm`, isSystem: true })
            conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
            conv.lastMessageAt = sysMsg.createdAt
            await conv.save()
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conversationId}`).emit('new_message', populatedMsg)
                io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
            }
        } catch (e) { console.error('system message / emit failed', e) }

        return res.status(200).json({ message: 'Bạn đã rời nhóm' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const markAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }
        const userId = String(user._id)
        await Conversation.findByIdAndUpdate(conversationId, { [`unreadCounts.${userId}`]: 0 }).exec()
        return res.status(200).json({ success: true })
    } catch (e) {
        return res.status(500).json({ message: error.message })
    }
}

export const getInviteLink = async (req, res) => {
    try {
        const { conversationId } = req.params
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group not found' })
        const isMember = (conv.participants || []).some(p => String(p.userId) === String(user._id))
        if (!isMember) return res.status(403).json({ message: 'Không phải thành viên nhóm' })

        let group = conv.groupId
        if (!group) return res.status(404).json({ message: 'Group data not found' })
        // generate code if not exists
        if (!group.inviteCode) {
            group.inviteCode = crypto.randomBytes(6).toString('hex')
            await group.save()
        }
        return res.status(200).json({ inviteCode: group.inviteCode })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const joinByInvite = async (req, res) => {
    try {
        const { inviteCode } = req.body
        if (!inviteCode) return res.status(400).json({ message: 'inviteCode required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const group = await Group.findOne({ inviteCode })
        if (!group) return res.status(404).json({ message: 'Mã mời không hợp lệ' })

        const conv = await Conversation.findOne({ groupId: group._id })
        if (!conv) return res.status(404).json({ message: 'Không tìm thấy nhóm' })

        const alreadyMember = (conv.participants || []).some(p => String(p.userId) === String(user._id))
        if (alreadyMember) return res.status(400).json({ message: 'Đã là thành viên', conversationId: conv._id })

        conv.participants.push({ userId: user._id, joinedAt: new Date(), role: 'Thành viên' })
        await conv.save()

        // system message
        const sysMsg = await Message.create({
            conversationId: conv._id, senderId: user._id,
            content: `${user.name} đã tham gia nhóm qua link mời`, isSystem: true
        })
        conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
        conv.lastMessageAt = sysMsg.createdAt
        await conv.save()

        try {
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conv._id}`).emit('new_message', populatedMsg)
                io.to(`conv:${conv._id}`).emit('group_updated', { conversationId: String(conv._id) })
            }
        } catch (e) { console.error('emit failed', e) }

        return res.status(200).json({ message: 'Tham gia nhóm thành công', conversationId: conv._id })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}

export const transferOwnership = async (req, res) => {
    try {
        const { conversationId, newOwnerId } = req.body
        if (!conversationId || !newOwnerId) return res.status(400).json({ message: 'conversationId and newOwnerId required' })
        const token = getTokenFromHeader(req)
        if (!token) return res.status(401).json({ message: 'Unauthorized' })
        let user;
        try { user = await getUserByToken(token); } catch (e) { return res.status(401).json({ message: e.message }); }

        const conv = await Conversation.findById(conversationId).populate('groupId')
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group not found' })

        const actor = (conv.participants || []).find(p => String(p.userId) === String(user._id))
        if (!actor || actor.role !== 'Trưởng nhóm') return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền này' })

        const target = (conv.participants || []).find(p => String(p.userId) === String(newOwnerId))
        if (!target) return res.status(404).json({ message: 'Thành viên không tồn tại trong nhóm' })

        const newOwner = await User.findById(newOwnerId).select('name').lean()

        // Update roles in participants
        conv.participants = conv.participants.map(p => {
            const obj = p.toObject ? p.toObject() : { ...p }
            if (String(p.userId) === String(user._id)) return { ...obj, role: 'Thành viên' }
            if (String(p.userId) === String(newOwnerId)) return { ...obj, role: 'Trưởng nhóm' }
            return obj
        })
        await conv.save()

        // Update Group.ownerId and remove newOwner from deputies
        await Group.findByIdAndUpdate(conv.groupId._id, {
            ownerId: newOwnerId,
            $pull: { deputyIds: newOwnerId }
        }).exec()

        // system message
        const sysMsg = await Message.create({
            conversationId, senderId: user._id,
            content: `${user.name} đã chuyển quyền trưởng nhóm cho ${newOwner?.name || 'thành viên'}`, isSystem: true
        })
        conv.lastMessage = { _id: sysMsg._id, content: sysMsg.content, senderId: user._id, createdAt: sysMsg.createdAt }
        conv.lastMessageAt = sysMsg.createdAt
        await conv.save()

        try {
            const io = getIo()
            if (io) {
                const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'name avatarUrl')
                io.to(`conv:${conversationId}`).emit('new_message', populatedMsg)
                io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
            }
        } catch (e) { console.error('emit failed', e) }

        return res.status(200).json({ message: 'Đã chuyển quyền trưởng nhóm' })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ message: error.message })
    }
}