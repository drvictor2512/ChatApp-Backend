import crypto from 'crypto'
import { getUserByToken } from '../infrastructure/libs/verifyToken.js'
import { getIo } from '../infrastructure/libs/socket.js'
import { uploadFile } from '../shared/util/fileService.js'
import { AppError } from '../shared/errors/AppError.js'
import {
    conversationRepository,
    friendRepository,
    messageRepository,
    userRepository,
} from '../repository/mongoose/repositories/index.js'

const getParticipantUserId = (participant) => {
    return String(participant?.userId?._id || participant?.userId || participant?._id || '')
}

const findParticipant = (conversation, userId) => {
    return (conversation.participants || []).find((p) => getParticipantUserId(p) === String(userId))
}

const normalizeGroupName = (conversation) => {
    const name = conversation.group?.name || 'Nhóm'
    if (!conversation.group) {
        conversation.group = { name }
    } else {
        conversation.group.name = name
    }
}

const generateUniqueInviteCode = async () => {
    let code = ''
    let exists = true
    while (exists) {
        code = crypto.randomBytes(6).toString('hex')
        exists = !!(await conversationRepository.existsInviteCode(code))
    }
    return code
}

const appendSystemMessageAndEmit = async ({ conversation, senderId, content }) => {
    const conversationId = String(conversation._id)
    const sysMsg = await messageRepository.createMessage({
        conversationId,
        senderId,
        content,
        isSystem: true,
    })

    conversation.lastMessage = {
        _id: sysMsg._id,
        content: sysMsg.content,
        senderId,
        createdAt: sysMsg.createdAt,
    }
    conversation.lastMessageAt = sysMsg.createdAt
    await conversation.save()

    const io = getIo()
    if (io) {
        io.to(`conv:${conversationId}`).emit('new_message', sysMsg)
        io.to(`conv:${conversationId}`).emit('group_updated', { conversationId })
    }
}

const loadUserFromToken = async (token) => {
    if (!token) throw new AppError('Unauthorized', 401)
    try {
        return await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }
}

export const createConversation = async ({ token, body }) => {
    const { type, name, memberIds } = body || {}
    const user = await loadUserFromToken(token)

    const userId = user._id
    let conversation

    if (type === 'DIRECT') {
        const participantId = memberIds && memberIds[0]
        if (!participantId) {
            throw new AppError('memberIds là bắt buộc cho cuộc trò chuyện trực tiếp', 400)
        }

        conversation = await conversationRepository.findDirectBetweenUsers(userId, participantId)

        if (!conversation) {
            conversation = await conversationRepository.createDirectConversation({
                type: 'DIRECT',
                participants: [{ userId }, { userId: participantId }],
                lastMessageAt: new Date(),
            })
        }
    } else if (type === 'GROUP') {
        if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
            throw new AppError('Tên nhóm và danh sách thành viên là bắt buộc', 400)
        }

        const uniqueMemberIds = Array.from(new Set([...(memberIds || []).map(String), String(userId)]))

        const notFriends = []
        for (const memberId of uniqueMemberIds) {
            if (String(memberId) === String(userId)) continue
            let a = String(userId)
            let b = String(memberId)
            if (a > b) [a, b] = [b, a]
            const exists = await friendRepository.findFriendship(a, b)
            if (!exists) notFriends.push(memberId)
        }

        if (notFriends.length > 0) {
            throw new AppError('Một hoặc nhiều thành viên chưa là bạn. Chỉ có thể thêm bạn bè vào nhóm', 400, {
                notFriends,
            })
        }

        const groupName = String(name).trim()
        const inviteCode = await generateUniqueInviteCode()
        const members = uniqueMemberIds.map((id) => ({
            userId: id,
            joinedAt: new Date(),
            role: String(id) === String(userId) ? 'Trưởng nhóm' : 'Thành viên',
        }))

        conversation = await conversationRepository.createGroupConversation({
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
        })

        await appendSystemMessageAndEmit({
            conversation,
            senderId: userId,
            content: `${user.name} đã tạo nhóm`,
        })
    } else {
        throw new AppError('Loại cuộc trò chuyện không hợp lệ', 400)
    }

    await conversation.populate([
        { path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' },
        { path: 'lastMessage.senderId', select: 'name avatarUrl email' },
    ])

    return conversation
}

export const getConversations = async ({ token }) => {
    const user = await loadUserFromToken(token)
    const userId = user._id

    const conversations = await conversationRepository
        .findByParticipantUserId(userId)
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .populate([{ path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' }])
        .populate([{ path: 'lastMessage.senderId', select: 'name avatarUrl email' }])

    const formatted = conversations.map((conv) => {
        const participants = (conv.participants || []).map((p) => ({
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

        const convObj = conv.toObject()
        const groupData = convObj.group || {}
        const groupName = convObj.type === 'GROUP' ? (groupData.name || '') : ''
        const groupAvatarUrl = convObj.type === 'GROUP' ? (groupData.avatarUrl || null) : null

        return {
            ...convObj,
            group: convObj.type === 'GROUP'
                ? {
                    ...groupData,
                    avatarUrl: groupAvatarUrl,
                    ownerId: groupData.ownerId?._id || groupData.ownerId || null,
                    deputyIds: Array.isArray(groupData.deputyIds)
                        ? groupData.deputyIds.map((id) => id?._id || id)
                        : [],
                }
                : undefined,
            groupName,
            name: groupName || convObj.name || null,
            groupAvatar: groupAvatarUrl,
            avatarUrl: convObj.type === 'GROUP' ? groupAvatarUrl : (convObj.avatarUrl || null),
            ownerId: groupData.ownerId?._id || groupData.ownerId || null,
            deputyIds: Array.isArray(groupData.deputyIds)
                ? groupData.deputyIds.map((id) => id?._id || id)
                : [],
            inviteCode: groupData.inviteCode || null,
            unreadCounts: conv.unreadCounts || {},
            participants,
        }
    })

    return { conversations: formatted }
}

export const getMessages = async ({ conversationId, limit = 30, cursor }) => {
    const query = { conversationId }
    if (cursor) {
        query.createdAt = { $lt: new Date(cursor) }
    }

    let messages = await messageRepository.findMessagesWithPopulate(query, {
        sort: { createdAt: -1 },
        limit: Number(limit) + 1,
    })

    let nextCursor = null
    if (messages.length > Number(limit)) {
        const nextMessage = messages[messages.length - 1]
        nextCursor = nextMessage.createdAt.toISOString()
        messages.pop()
    }

    messages = messages.reverse()
    return { messages, nextCursor }
}

export const renameGroup = async ({ token, body }) => {
    const { conversationId, name } = body || {}
    if (!conversationId || !name) throw new AppError('conversationId and name required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const participant = findParticipant(conv, user._id)
    if (!participant) throw new AppError('Bạn không phải thành viên nhóm', 403)
    if (!(participant.role === 'Trưởng nhóm' || participant.role === 'Phó nhóm')) {
        throw new AppError('Không đủ quyền', 403)
    }

    if (!conv.group) conv.group = {}
    conv.group.name = String(name).trim()
    await conv.save()

    try {
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã đổi tên nhóm thành ${conv.group.name}`,
        })
    } catch (e) {
        console.error('system message / emit failed', e)
    }

    return { message: 'Đổi tên nhóm thành công' }
}

export const updateGroupAvatar = async ({ token, body, file }) => {
    const { conversationId } = body || {}
    if (!conversationId) throw new AppError('conversationId required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const participant = findParticipant(conv, user._id)
    if (!participant) throw new AppError('Bạn không phải thành viên nhóm', 403)
    if (!(participant.role === 'Trưởng nhóm' || participant.role === 'Phó nhóm')) {
        throw new AppError('Không đủ quyền', 403)
    }

    if (!file) throw new AppError('Không có file được gửi lên', 400)
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        throw new AppError('Chỉ cho phép file hình ảnh cho ảnh nhóm', 400)
    }

    const uploadedUrl = await uploadFile(file)
    if (!conv.group) conv.group = { name: 'Nhóm' }
    conv.group.avatarUrl = uploadedUrl
    await conv.save()

    try {
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã đổi ảnh nhóm`,
        })
    } catch (e) {
        console.error('system message / emit failed', e)
    }

    return {
        message: 'Đổi ảnh nhóm thành công',
        avatarUrl: uploadedUrl,
        conversationId: String(conv._id),
    }
}

export const addGroupMember = async ({ token, body }) => {
    const { conversationId, memberId } = body || {}
    if (!conversationId || !memberId) throw new AppError('conversationId and memberId required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const isMember = !!findParticipant(conv, user._id)
    if (!isMember) throw new AppError('Bạn không phải thành viên nhóm', 403)

    if (String(memberId) !== String(user._id)) {
        let a = String(user._id)
        let b = String(memberId)
        if (a > b) [a, b] = [b, a]
        const exists = await friendRepository.findFriendship(a, b)
        if (!exists) throw new AppError('Chỉ có thể thêm bạn bè vào nhóm', 400)
    }

    if (findParticipant(conv, memberId)) {
        throw new AppError('Đã là thành viên', 400)
    }

    conv.participants.push({ userId: memberId, joinedAt: new Date(), role: 'Thành viên' })
    await conv.save()

    const addedUser = await userRepository.findByIdSelect(memberId, 'name').lean()
    try {
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã thêm ${addedUser?.name || 'thành viên'} vào nhóm`,
        })
    } catch (e) {
        console.error('emit group_updated failed', e)
    }

    return { message: 'Đã thêm thành viên' }
}

export const removeGroupMember = async ({ token, body }) => {
    const { conversationId, memberId } = body || {}
    if (!conversationId || !memberId) throw new AppError('conversationId and memberId required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const actor = findParticipant(conv, user._id)
    if (!actor) throw new AppError('Bạn không phải thành viên nhóm', 403)
    if (!(actor.role === 'Trưởng nhóm' || actor.role === 'Phó nhóm')) {
        throw new AppError('Không đủ quyền', 403)
    }

    const target = findParticipant(conv, memberId)
    if (!target) throw new AppError('Thành viên không tìm thấy', 404)
    if (target.role === 'Trưởng nhóm') throw new AppError('Không thể xóa trưởng nhóm', 400)

    conv.participants = (conv.participants || []).filter((p) => getParticipantUserId(p) !== String(memberId))
    if (!conv.group) conv.group = { name: 'Nhóm' }
    conv.group.deputyIds = (conv.group.deputyIds || []).filter((id) => String(id) !== String(memberId))
    await conv.save()

    try {
        const removedUser = await userRepository.findByIdSelect(memberId, 'name').lean()
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã xoá ${removedUser?.name || 'thành viên'} khỏi nhóm`,
        })
    } catch (e) {
        console.error('system message / emit failed', e)
    }

    return { message: 'Đã xóa thành viên' }
}

export const assignDeputy = async ({ token, body }) => {
    const { conversationId, memberId, action } = body || {}
    if (!conversationId || !memberId || !action) {
        throw new AppError('conversationId, memberId and action required', 400)
    }

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const actor = findParticipant(conv, user._id)
    if (!actor || actor.role !== 'Trưởng nhóm') {
        throw new AppError('Chỉ trưởng nhóm mới có quyền này', 403)
    }

    const target = findParticipant(conv, memberId)
    if (!target) throw new AppError('Thành viên không tìm thấy', 404)
    if (target.role === 'Trưởng nhóm') throw new AppError('Không thể thay đổi quyền của trưởng nhóm', 400)

    const actionLower = String(action).toLowerCase()
    const assignActions = ['assign', 'add', 'promote']
    const removeActions = ['remove', 'revoke', 'demote', 'unassign']
    if (!conv.group) conv.group = { name: 'Nhóm' }

    if (assignActions.includes(actionLower)) {
        conv.group.deputyIds = Array.from(new Set([...(conv.group.deputyIds || []).map(String), String(memberId)]))
        conv.participants = (conv.participants || []).map((p) => {
            const obj = p.toObject ? p.toObject() : { ...p }
            if (String(obj.userId) === String(memberId)) {
                return { ...obj, role: 'Phó nhóm' }
            }
            return obj
        })
    } else if (removeActions.includes(actionLower)) {
        conv.group.deputyIds = (conv.group.deputyIds || []).filter((id) => String(id) !== String(memberId))
        conv.participants = (conv.participants || []).map((p) => {
            const obj = p.toObject ? p.toObject() : { ...p }
            if (String(obj.userId) === String(memberId)) {
                return { ...obj, role: 'Thành viên' }
            }
            return obj
        })
    } else {
        throw new AppError('action must be assign or remove', 400)
    }

    await conv.save()

    try {
        const targetUser = await userRepository.findByIdSelect(memberId, 'name').lean()
        const msgContent = assignActions.includes(actionLower)
            ? `${targetUser?.name || 'Thành viên'} đã được bổ nhiệm làm phó nhóm`
            : `${targetUser?.name || 'Thành viên'} đã bị thu hồi quyền phó nhóm`
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: msgContent,
        })
    } catch (e) {
        console.error('system message / emit failed', e)
    }

    return { message: 'Đã cập nhật quyền phó nhóm' }
}

export const deleteGroup = async ({ token, conversationId }) => {
    if (!conversationId) throw new AppError('conversationId required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const actor = findParticipant(conv, user._id)
    if (!actor || actor.role !== 'Trưởng nhóm') {
        throw new AppError('Chỉ trưởng nhóm mới có quyền xóa nhóm', 403)
    }

    const io = getIo()
    if (io) io.to(`conv:${conversationId}`).emit('group_updated', { conversationId, deleted: true })

    await messageRepository.deleteManyByConversationId(conversationId)
    await conversationRepository.deleteById(conversationId)

    return { message: 'Đã xóa nhóm' }
}

export const leaveGroup = async ({ token, body }) => {
    const { conversationId } = body || {}
    if (!conversationId) throw new AppError('conversationId required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group conversation not found', 404)

    const participant = findParticipant(conv, user._id)
    if (!participant) throw new AppError('Bạn không phải thành viên nhóm', 403)
    if (participant.role === 'Trưởng nhóm') {
        throw new AppError('Trưởng nhóm không thể rời nhóm', 400)
    }

    conv.participants = (conv.participants || []).filter((p) => getParticipantUserId(p) !== String(user._id))
    if (!conv.group) conv.group = { name: 'Nhóm' }
    conv.group.deputyIds = (conv.group.deputyIds || []).filter((id) => String(id) !== String(user._id))
    await conv.save()

    try {
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã rời khỏi nhóm`,
        })
    } catch (e) {
        console.error('system message / emit failed', e)
    }

    return { message: 'Bạn đã rời nhóm' }
}

export const markAsRead = async ({ token, conversationId }) => {
    if (!conversationId) throw new AppError('conversationId required', 400)

    const user = await loadUserFromToken(token)
    const userId = String(user._id)

    await conversationRepository.updateUnreadCount(conversationId, userId)
    return { success: true }
}

export const getInviteLink = async ({ token, conversationId }) => {
    if (!conversationId) throw new AppError('conversationId required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group not found', 404)

    const isMember = !!findParticipant(conv, user._id)
    if (!isMember) throw new AppError('Không phải thành viên nhóm', 403)

    if (!conv.group) conv.group = { name: 'Nhóm' }
    if (!conv.group.inviteCode) {
        conv.group.inviteCode = await generateUniqueInviteCode()
        await conv.save()
    }

    return { inviteCode: conv.group.inviteCode }
}

export const joinByInvite = async ({ token, inviteCode }) => {
    if (!inviteCode) throw new AppError('inviteCode required', 400)

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findGroupByInviteCode(String(inviteCode).trim())
    if (!conv) throw new AppError('Mã mời không hợp lệ', 404)

    const alreadyMember = !!findParticipant(conv, user._id)
    if (alreadyMember) {
        throw new AppError('Đã là thành viên', 400, { conversationId: conv._id })
    }

    conv.participants.push({ userId: user._id, joinedAt: new Date(), role: 'Thành viên' })
    normalizeGroupName(conv)
    await conv.save()

    try {
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã tham gia nhóm qua link mời`,
        })
    } catch (e) {
        console.error('emit failed', e)
    }

    return { message: 'Tham gia nhóm thành công', conversationId: conv._id }
}

export const transferOwnership = async ({ token, body }) => {
    const { conversationId, newOwnerId } = body || {}
    if (!conversationId || !newOwnerId) {
        throw new AppError('conversationId and newOwnerId required', 400)
    }

    const user = await loadUserFromToken(token)
    const conv = await conversationRepository.findById(conversationId)
    if (!conv || conv.type !== 'GROUP') throw new AppError('Group not found', 404)

    const actor = findParticipant(conv, user._id)
    if (!actor || actor.role !== 'Trưởng nhóm') {
        throw new AppError('Chỉ trưởng nhóm mới có quyền này', 403)
    }

    const target = findParticipant(conv, newOwnerId)
    if (!target) throw new AppError('Thành viên không tồn tại trong nhóm', 404)

    const newOwner = await userRepository.findByIdSelect(newOwnerId, 'name').lean()

    conv.participants = (conv.participants || []).map((p) => {
        const obj = p.toObject ? p.toObject() : { ...p }
        if (String(obj.userId) === String(user._id)) return { ...obj, role: 'Thành viên' }
        if (String(obj.userId) === String(newOwnerId)) return { ...obj, role: 'Trưởng nhóm' }
        return obj
    })
    if (!conv.group) conv.group = { name: 'Nhóm' }
    conv.group.ownerId = newOwnerId
    conv.group.deputyIds = (conv.group.deputyIds || []).filter((id) => String(id) !== String(newOwnerId))
    await conv.save()

    try {
        await appendSystemMessageAndEmit({
            conversation: conv,
            senderId: user._id,
            content: `${user.name} đã chuyển quyền trưởng nhóm cho ${newOwner?.name || 'thành viên'}`,
        })
    } catch (e) {
        console.error('emit failed', e)
    }

    return { message: 'Đã chuyển quyền trưởng nhóm' }
}
