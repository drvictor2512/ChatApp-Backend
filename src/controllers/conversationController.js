import Conversation from '../models/Conversation.js';
import { getUserByToken } from '../libs/verifyToken.js';
import User from '../models/User.js';
import Message from '../models/Message.js';
import Friend from '../models/Friend.js';
import { getIo } from '../libs/socket.js';
import crypto from 'crypto';

const getTokenFromHeader = (req) => {
    const authHeader = req.headers.authorization || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
};

const getParticipantUserId = (participant) => {
    return String(participant?.userId?._id || participant?.userId || participant?._id || '');
};

const findParticipant = (conversation, userId) => {
    return (conversation.participants || []).find(p => getParticipantUserId(p) === String(userId));
};

const normalizeGroupName = (conversation) => {
    const name = conversation.group?.name || 'Nhóm';
    if (!conversation.group) {
        conversation.group = { name };
    } else {
        conversation.group.name = name;
    }
};

const generateUniqueInviteCode = async () => {
    let code = '';
    let exists = true;
    while (exists) {
        code = crypto.randomBytes(6).toString('hex');
        exists = !!(await Conversation.exists({ type: 'GROUP', 'group.inviteCode': code }));
    }
    return code;
};

const appendSystemMessageAndEmit = async ({ conversation, senderId, content }) => {
    const conversationId = String(conversation._id);
    const sysMsg = await Message.create({
        conversationId,
        senderId,
        content,
        isSystem: true,
    });

    conversation.lastMessage = {
        _id: sysMsg._id,
        content: sysMsg.content,
        senderId,
        createdAt: sysMsg.createdAt,
    };
    conversation.lastMessageAt = sysMsg.createdAt;
    await conversation.save();

    const io = getIo();
    if (io) {
        io.to(`conv:${conversationId}`).emit('new_message', sysMsg);
        io.to(`conv:${conversationId}`).emit('group_updated', { conversationId });
    }
};

export const createConversation = async (req, res) => {
    try {
        const { type, name, memberIds } = req.body;
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const userId = user._id;
        let conversation;

        if (type === 'DIRECT') {
            const participantId = memberIds && memberIds[0];
            if (!participantId) {
                return res.status(400).json({ message: 'memberIds là bắt buộc cho cuộc trò chuyện trực tiếp' });
            }

            conversation = await Conversation.findOne({
                type: 'DIRECT',
                'participants.userId': { $all: [userId, participantId] },
            });

            if (!conversation) {
                conversation = new Conversation({
                    type: 'DIRECT',
                    participants: [{ userId }, { userId: participantId }],
                    lastMessageAt: new Date(),
                });
                await conversation.save();
            }
        } else if (type === 'GROUP') {
            if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
                return res.status(400).json({ message: 'Tên nhóm và danh sách thành viên là bắt buộc' });
            }

            const uniqueMemberIds = Array.from(new Set([...(memberIds || []).map(String), String(userId)]));

            const notFriends = [];
            for (const memberId of uniqueMemberIds) {
                if (String(memberId) === String(userId)) continue;
                let a = String(userId);
                let b = String(memberId);
                if (a > b) [a, b] = [b, a];
                const exists = await Friend.findOne({ userIdA: a, userIdB: b });
                if (!exists) notFriends.push(memberId);
            }

            if (notFriends.length > 0) {
                return res.status(400).json({
                    message: 'Một hoặc nhiều thành viên chưa là bạn. Chỉ có thể thêm bạn bè vào nhóm',
                    notFriends,
                });
            }

            const groupName = String(name).trim();
            const inviteCode = await generateUniqueInviteCode();
            const members = uniqueMemberIds.map(id => ({
                userId: id,
                joinedAt: new Date(),
                role: String(id) === String(userId) ? 'Trưởng nhóm' : 'Thành viên',
            }));

            conversation = new Conversation({
                type: 'GROUP',
                group: {
                    name: groupName,
                    ownerId: userId,
                    deputyIds: [],
                    createdBy: userId,
                    inviteCode,
                },
                participants: members,
                lastMessageAt: new Date(),
                unreadCounts: new Map(),
            });
            await conversation.save();

            await appendSystemMessageAndEmit({
                conversation,
                senderId: userId,
                content: `${user.name} đã tạo nhóm`,
            });
        } else {
            return res.status(400).json({ message: 'Loại cuộc trò chuyện không hợp lệ' });
        }

        await conversation.populate([
            { path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' },
            { path: 'lastMessage.senderId', select: 'name avatarUrl email' },
        ]);

        return res.status(201).json(conversation);
    } catch (error) {
        console.error('Lỗi khi tạo cuộc trò chuyện:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const getConversations = async (req, res) => {
    try {
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const userId = user._id;
        const conversations = await Conversation.find({ 'participants.userId': userId })
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .populate([{ path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' }])
            .populate([{ path: 'lastMessage.senderId', select: 'name avatarUrl email' }]);

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
            }));

            const convObj = conv.toObject();
            const groupData = convObj.group || {};
            const groupName = convObj.type === 'GROUP' ? (groupData.name || '') : '';

            return {
                ...convObj,
                group: convObj.type === 'GROUP'
                    ? {
                        ...groupData,
                        ownerId: groupData.ownerId?._id || groupData.ownerId || null,
                        deputyIds: Array.isArray(groupData.deputyIds)
                            ? groupData.deputyIds.map(id => id?._id || id)
                            : [],
                    }
                    : undefined,
                // Keep backward-compatible fields for clients during transition.
                groupName,
                name: groupName || convObj.name || null,
                ownerId: groupData.ownerId?._id || groupData.ownerId || null,
                deputyIds: Array.isArray(groupData.deputyIds)
                    ? groupData.deputyIds.map(id => id?._id || id)
                    : [],
                inviteCode: groupData.inviteCode || null,
                unreadCounts: conv.unreadCounts || {},
                participants,
            };
        });

        return res.status(200).json({ conversations: formatted });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách cuộc trò chuyện:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 30, cursor } = req.query;
        const query = { conversationId };

        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        let messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit) + 1)
            .populate({ path: 'senderId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' })
            .populate({ path: 'reactions.userId', select: 'name avatarUrl' })
            .populate({ path: 'pinnedBy', select: 'name avatarUrl' })
            .populate({ path: 'replyTo', select: 'content fileUrl fileUrls senderId isRecalled createdAt' })
            .populate({ path: 'replyTo.senderId', select: 'name avatarUrl' })
            .populate({ path: 'forwardedFrom.originalSenderId', select: 'name avatarUrl' });

        let nextCursor = null;
        if (messages.length > Number(limit)) {
            const nextMessage = messages[messages.length - 1];
            nextCursor = nextMessage.createdAt.toISOString();
            messages.pop();
        }

        messages = messages.reverse();
        return res.status(200).json({ messages, nextCursor });
    } catch (error) {
        console.error('Lỗi khi lấy tin nhắn:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const renameGroup = async (req, res) => {
    try {
        const { conversationId, name } = req.body;
        if (!conversationId || !name) {
            return res.status(400).json({ message: 'conversationId and name required' });
        }

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') {
            return res.status(404).json({ message: 'Group conversation not found' });
        }

        const participant = findParticipant(conv, user._id);
        if (!participant) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' });
        if (!(participant.role === 'Trưởng nhóm' || participant.role === 'Phó nhóm')) {
            return res.status(403).json({ message: 'Không đủ quyền' });
        }

        if (!conv.group) conv.group = {};
        conv.group.name = String(name).trim();
        await conv.save();

        try {
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: `${user.name} đã đổi tên nhóm thành ${conv.group.name}`,
            });
        } catch (e) {
            console.error('system message / emit failed', e);
        }

        return res.status(200).json({ message: 'Đổi tên nhóm thành công' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const addGroupMember = async (req, res) => {
    try {
        const { conversationId, memberId } = req.body;
        if (!conversationId || !memberId) {
            return res.status(400).json({ message: 'conversationId and memberId required' });
        }

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') {
            return res.status(404).json({ message: 'Group conversation not found' });
        }

        const isMember = !!findParticipant(conv, user._id);
        if (!isMember) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' });

        if (String(memberId) !== String(user._id)) {
            let a = String(user._id);
            let b = String(memberId);
            if (a > b) [a, b] = [b, a];
            const exists = await Friend.findOne({ userIdA: a, userIdB: b });
            if (!exists) return res.status(400).json({ message: 'Chỉ có thể thêm bạn bè vào nhóm' });
        }

        if (findParticipant(conv, memberId)) {
            return res.status(400).json({ message: 'Đã là thành viên' });
        }

        conv.participants.push({ userId: memberId, joinedAt: new Date(), role: 'Thành viên' });
        await conv.save();

        const addedUser = await User.findById(memberId).select('name').lean();
        try {
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: `${user.name} đã thêm ${addedUser?.name || 'thành viên'} vào nhóm`,
            });
        } catch (e) {
            console.error('emit group_updated failed', e);
        }

        return res.status(200).json({ message: 'Đã thêm thành viên' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const removeGroupMember = async (req, res) => {
    try {
        const { conversationId, memberId } = req.body;
        if (!conversationId || !memberId) {
            return res.status(400).json({ message: 'conversationId and memberId required' });
        }

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') {
            return res.status(404).json({ message: 'Group conversation not found' });
        }

        const actor = findParticipant(conv, user._id);
        if (!actor) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' });
        if (!(actor.role === 'Trưởng nhóm' || actor.role === 'Phó nhóm')) {
            return res.status(403).json({ message: 'Không đủ quyền' });
        }

        const target = findParticipant(conv, memberId);
        if (!target) return res.status(404).json({ message: 'Thành viên không tìm thấy' });
        if (target.role === 'Trưởng nhóm') {
            return res.status(400).json({ message: 'Không thể xóa trưởng nhóm' });
        }

        conv.participants = (conv.participants || []).filter(p => getParticipantUserId(p) !== String(memberId));
        if (!conv.group) conv.group = { name: 'Nhóm' };
        conv.group.deputyIds = (conv.group.deputyIds || []).filter(id => String(id) !== String(memberId));
        await conv.save();

        try {
            const removedUser = await User.findById(memberId).select('name').lean();
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: `${user.name} đã xoá ${removedUser?.name || 'thành viên'} khỏi nhóm`,
            });
        } catch (e) {
            console.error('system message / emit failed', e);
        }

        return res.status(200).json({ message: 'Đã xóa thành viên' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const assignDeputy = async (req, res) => {
    try {
        const { conversationId, memberId, action } = req.body;
        if (!conversationId || !memberId || !action) {
            return res.status(400).json({ message: 'conversationId, memberId and action required' });
        }

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') {
            return res.status(404).json({ message: 'Group conversation not found' });
        }

        const actor = findParticipant(conv, user._id);
        if (!actor || actor.role !== 'Trưởng nhóm') {
            return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền này' });
        }

        const target = findParticipant(conv, memberId);
        if (!target) return res.status(404).json({ message: 'Thành viên không tìm thấy' });
        if (target.role === 'Trưởng nhóm') {
            return res.status(400).json({ message: 'Không thể thay đổi quyền của trưởng nhóm' });
        }

        const actionLower = String(action).toLowerCase();
        const assignActions = ['assign', 'add', 'promote'];
        const removeActions = ['remove', 'revoke', 'demote', 'unassign'];
        if (!conv.group) conv.group = { name: 'Nhóm' };

        if (assignActions.includes(actionLower)) {
            conv.group.deputyIds = Array.from(new Set([...(conv.group.deputyIds || []).map(String), String(memberId)]));
            conv.participants = (conv.participants || []).map(p => {
                const obj = p.toObject ? p.toObject() : { ...p };
                if (String(obj.userId) === String(memberId)) {
                    return { ...obj, role: 'Phó nhóm' };
                }
                return obj;
            });
        } else if (removeActions.includes(actionLower)) {
            conv.group.deputyIds = (conv.group.deputyIds || []).filter(id => String(id) !== String(memberId));
            conv.participants = (conv.participants || []).map(p => {
                const obj = p.toObject ? p.toObject() : { ...p };
                if (String(obj.userId) === String(memberId)) {
                    return { ...obj, role: 'Thành viên' };
                }
                return obj;
            });
        } else {
            return res.status(400).json({ message: 'action must be assign or remove' });
        }

        await conv.save();

        try {
            const targetUser = await User.findById(memberId).select('name').lean();
            const msgContent = assignActions.includes(actionLower)
                ? `${targetUser?.name || 'Thành viên'} đã được bổ nhiệm làm phó nhóm`
                : `${targetUser?.name || 'Thành viên'} đã bị thu hồi quyền phó nhóm`;
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: msgContent,
            });
        } catch (e) {
            console.error('system message / emit failed', e);
        }

        return res.status(200).json({ message: 'Đã cập nhật quyền phó nhóm' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const deleteGroup = async (req, res) => {
    try {
        const { conversationId } = req.params;
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' });

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') {
            return res.status(404).json({ message: 'Group conversation not found' });
        }

        const actor = findParticipant(conv, user._id);
        if (!actor || actor.role !== 'Trưởng nhóm') {
            return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền xóa nhóm' });
        }

        try {
            const io = getIo();
            if (io) io.to(`conv:${conversationId}`).emit('group_updated', { conversationId, deleted: true });
        } catch (e) {
            console.error('emit group_updated failed', e);
        }

        await Message.deleteMany({ conversationId }).exec();
        await Conversation.findByIdAndDelete(conversationId).exec();

        return res.status(200).json({ message: 'Đã xóa nhóm' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const leaveGroup = async (req, res) => {
    try {
        const { conversationId } = req.body;
        if (!conversationId) return res.status(400).json({ message: 'conversationId required' });

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') {
            return res.status(404).json({ message: 'Group conversation not found' });
        }

        const participant = findParticipant(conv, user._id);
        if (!participant) return res.status(403).json({ message: 'Bạn không phải thành viên nhóm' });
        if (participant.role === 'Trưởng nhóm') {
            return res.status(400).json({ message: 'Trưởng nhóm không thể rời nhóm' });
        }

        conv.participants = (conv.participants || []).filter(p => getParticipantUserId(p) !== String(user._id));
        if (!conv.group) conv.group = { name: 'Nhóm' };
        conv.group.deputyIds = (conv.group.deputyIds || []).filter(id => String(id) !== String(user._id));
        await conv.save();

        try {
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: `${user.name} đã rời khỏi nhóm`,
            });
        } catch (e) {
            console.error('system message / emit failed', e);
        }

        return res.status(200).json({ message: 'Bạn đã rời nhóm' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const markAsRead = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const userId = String(user._id);
        await Conversation.findByIdAndUpdate(conversationId, { [`unreadCounts.${userId}`]: 0 }).exec();
        return res.status(200).json({ success: true });
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
};

export const getInviteLink = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group not found' });

        const isMember = !!findParticipant(conv, user._id);
        if (!isMember) return res.status(403).json({ message: 'Không phải thành viên nhóm' });

        if (!conv.group) conv.group = { name: 'Nhóm' };
        if (!conv.group.inviteCode) {
            conv.group.inviteCode = await generateUniqueInviteCode();
            await conv.save();
        }

        return res.status(200).json({ inviteCode: conv.group.inviteCode });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const joinByInvite = async (req, res) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) return res.status(400).json({ message: 'inviteCode required' });

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findOne({ type: 'GROUP', 'group.inviteCode': String(inviteCode).trim() });
        if (!conv) return res.status(404).json({ message: 'Mã mời không hợp lệ' });

        const alreadyMember = !!findParticipant(conv, user._id);
        if (alreadyMember) return res.status(400).json({ message: 'Đã là thành viên', conversationId: conv._id });

        conv.participants.push({ userId: user._id, joinedAt: new Date(), role: 'Thành viên' });
        normalizeGroupName(conv);
        await conv.save();

        try {
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: `${user.name} đã tham gia nhóm qua link mời`,
            });
        } catch (e) {
            console.error('emit failed', e);
        }

        return res.status(200).json({ message: 'Tham gia nhóm thành công', conversationId: conv._id });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};

export const transferOwnership = async (req, res) => {
    try {
        const { conversationId, newOwnerId } = req.body;
        if (!conversationId || !newOwnerId) {
            return res.status(400).json({ message: 'conversationId and newOwnerId required' });
        }

        const token = getTokenFromHeader(req);
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        let user;
        try {
            user = await getUserByToken(token);
        } catch (e) {
            return res.status(401).json({ message: e.message });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv || conv.type !== 'GROUP') return res.status(404).json({ message: 'Group not found' });

        const actor = findParticipant(conv, user._id);
        if (!actor || actor.role !== 'Trưởng nhóm') {
            return res.status(403).json({ message: 'Chỉ trưởng nhóm mới có quyền này' });
        }

        const target = findParticipant(conv, newOwnerId);
        if (!target) return res.status(404).json({ message: 'Thành viên không tồn tại trong nhóm' });

        const newOwner = await User.findById(newOwnerId).select('name').lean();

        conv.participants = (conv.participants || []).map(p => {
            const obj = p.toObject ? p.toObject() : { ...p };
            if (String(obj.userId) === String(user._id)) return { ...obj, role: 'Thành viên' };
            if (String(obj.userId) === String(newOwnerId)) return { ...obj, role: 'Trưởng nhóm' };
            return obj;
        });
        if (!conv.group) conv.group = { name: 'Nhóm' };
        conv.group.ownerId = newOwnerId;
        conv.group.deputyIds = (conv.group.deputyIds || []).filter(id => String(id) !== String(newOwnerId));
        await conv.save();

        try {
            await appendSystemMessageAndEmit({
                conversation: conv,
                senderId: user._id,
                content: `${user.name} đã chuyển quyền trưởng nhóm cho ${newOwner?.name || 'thành viên'}`,
            });
        } catch (e) {
            console.error('emit failed', e);
        }

        return res.status(200).json({ message: 'Đã chuyển quyền trưởng nhóm' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
};
