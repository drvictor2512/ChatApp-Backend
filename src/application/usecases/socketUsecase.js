import * as aiUsecase from './aiUsecase.js'
import { conversationRepository, userRepository } from '../../repository/mongoose/repositories/index.js'

export const handleJoin = async ({ io, socket, userId, onlineUsers }) => {
    if (!userId) return
    socket.join(`user:${userId}`)
    socket.data.userId = String(userId)
    onlineUsers.set(String(userId), { status: 'online', lastSeen: null })

    const payload = { userId: String(userId), status: 'online', lastSeen: null }
    io.emit('user_status', payload)

    try {
        const userConvs = await conversationRepository.findByParticipantUserId(String(userId)).select('_id').lean()
        userConvs.forEach((c) => socket.join(`conv:${c._id}`))
    } catch (e) {
        console.error('Error auto-joining conv rooms', e)
    }

    try {
        const convs = await conversationRepository
            .findByParticipantUserId(String(userId))
            .select('participants')
            .lean()

        const participantIds = new Set()
        convs.forEach((c) => {
            (c.participants || []).forEach((p) => {
                if (p && String(p.userId) !== String(userId)) participantIds.add(String(p.userId))
            })
        })

        const ids = Array.from(participantIds)
        const users = []
        let docs = []
        if (ids.length > 0) {
            docs = await userRepository.findByIdsSelect(ids, '_id lastSeen').lean()
            const idsSet = new Set(docs.map((d) => String(d._id)))
            ids.forEach((id) => {
                const info = onlineUsers.get(String(id))
                if (info) {
                    users.push({ userId: String(id), status: info.status, lastSeen: info.lastSeen })
                } else if (idsSet.has(String(id))) {
                    const doc = docs.find((d) => String(d._id) === String(id))
                    users.push({ userId: String(id), status: 'offline', lastSeen: doc ? doc.lastSeen : null })
                } else {
                    users.push({ userId: String(id), status: 'offline', lastSeen: null })
                }
            })
        }
        socket.emit('online_users', { users })
    } catch (e) {
        console.error('Error sending online_users to socket', e)
    }
}

export const handleJoinConversation = ({ socket, conversationId }) => {
    if (conversationId) socket.join(`conv:${conversationId}`)
}

export const handleLeaveConversation = ({ socket, conversationId }) => {
    if (conversationId) socket.leave(`conv:${conversationId}`)
}

export const handleAIMessage = async ({ socket, data }) => {
    return aiUsecase.handleAIMessage(socket, data || {})
}

export const createCallHelpers = ({ io, socket }) => {
    const getSocketUserId = () => (socket.data && socket.data.userId ? String(socket.data.userId) : null)

    const emitCallError = (message, extra = {}) => {
        socket.emit('call:error', { message, ...extra })
    }

    const forwardToUser = (targetUserId, event, payload) => {
        if (!targetUserId) return
        io.to(`user:${String(targetUserId)}`).emit(event, payload)
    }

    return { getSocketUserId, emitCallError, forwardToUser }
}

export const handleCallInvite = ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { targetUserId, callId, conversationId = null, offer = null, metadata = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:invite' })
    if (!targetUserId || !callId || !offer) {
        return emitCallError('Thiếu targetUserId hoặc callId hoặc offer', { event: 'call:invite' })
    }

    forwardToUser(String(targetUserId), 'call:incoming', {
        callId: String(callId),
        conversationId: conversationId ? String(conversationId) : null,
        fromUserId,
        offer,
        metadata,
        timestamp: Date.now(),
    })
}

export const handleCallAnswer = ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { targetUserId, callId, answer = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:answer' })
    if (!targetUserId || !callId || !answer) {
        return emitCallError('Thiếu targetUserId hoặc callId hoặc answer', { event: 'call:answer' })
    }

    forwardToUser(String(targetUserId), 'call:answered', {
        callId: String(callId),
        fromUserId,
        answer,
        timestamp: Date.now(),
    })
}

export const handleCallIceCandidate = ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { targetUserId, callId, candidate = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:ice-candidate' })
    if (!targetUserId || !callId || !candidate) {
        return emitCallError('Thiếu targetUserId hoặc callId hoặc candidate', { event: 'call:ice-candidate' })
    }

    forwardToUser(String(targetUserId), 'call:ice-candidate', {
        callId: String(callId),
        fromUserId,
        candidate,
        timestamp: Date.now(),
    })
}

export const handleCallReject = ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { targetUserId, callId, reason = 'rejected' } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:reject' })
    if (!targetUserId || !callId) {
        return emitCallError('Thiếu targetUserId hoặc callId', { event: 'call:reject' })
    }

    forwardToUser(String(targetUserId), 'call:rejected', {
        callId: String(callId),
        fromUserId,
        reason,
        timestamp: Date.now(),
    })
}

export const handleCallEnd = ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { targetUserId, callId, reason = 'ended' } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:end' })
    if (!targetUserId || !callId) {
        return emitCallError('Thiếu targetUserId hoặc callId', { event: 'call:end' })
    }

    forwardToUser(String(targetUserId), 'call:ended', {
        callId: String(callId),
        fromUserId,
        reason,
        timestamp: Date.now(),
    })
}

const getConversationMembership = async (conversationId, userId) => {
    if (!conversationId || !userId) return { ok: false, message: 'Thiếu conversationId hoặc userId' }

    const conversation = await conversationRepository.findByIdSelect(String(conversationId), '_id type participants.userId').lean()
    if (!conversation) return { ok: false, message: 'Cuộc trò chuyện không tồn tại' }

    const memberIds = (conversation.participants || []).map((p) => String(p?.userId)).filter(Boolean)
    if (!memberIds.includes(String(userId))) {
        return { ok: false, message: 'Bạn không phải thành viên cuộc trò chuyện' }
    }

    return { ok: true, conversation, memberIds }
}

const serializeActiveRoom = (room) => ({
    callId: String(room.callId),
    conversationId: String(room.conversationId),
    groupName: room.groupName || 'Nhóm chat',
    memberCount: room.participants.size,
    callType: room.callType || 'video',
    startedAt: Number(room.startedAt || Date.now()),
})

const broadcastRoomOngoing = (io, conversationId, activeGroupCallRooms) => {
    const room = activeGroupCallRooms.get(String(conversationId))
    if (!room) return
    io.to(`conv:${String(conversationId)}`).emit('group-call:ongoing', serializeActiveRoom(room))
}

export const handleGroupCallStart = async ({ io, socket, activeGroupCallRooms, payload }) => {
    const { getSocketUserId, emitCallError } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId, metadata = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:start' })
    if (!conversationId || !callId) return emitCallError('Thiếu conversationId hoặc callId', { event: 'group-call:start' })

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:start' })
        if (membership.conversation.type !== 'GROUP') {
            return emitCallError('group-call:start chỉ áp dụng cho GROUP conversation', { event: 'group-call:start' })
        }

        const conversationKey = String(conversationId)
        const existingRoom = activeGroupCallRooms.get(conversationKey)
        if (existingRoom) {
            existingRoom.participants.add(String(fromUserId))
            socket.emit('group-call:ongoing', serializeActiveRoom(existingRoom))
            broadcastRoomOngoing(io, conversationKey, activeGroupCallRooms)
            return
        }

        activeGroupCallRooms.set(conversationKey, {
            callId: String(callId),
            conversationId: conversationKey,
            groupName: metadata?.groupName || 'Nhóm chat',
            callType: metadata?.callType || 'video',
            startedAt: Date.now(),
            participants: new Set([String(fromUserId)]),
        })

        socket.to(`conv:${String(conversationId)}`).emit('group-call:incoming', {
            callId: String(callId),
            conversationId: String(conversationId),
            fromUserId,
            metadata,
            timestamp: Date.now(),
        })

        broadcastRoomOngoing(io, conversationKey, activeGroupCallRooms)
    } catch (e) {
        console.error('group-call:start error', e)
        emitCallError('Lỗi hệ thống khi bắt đầu call nhóm', { event: 'group-call:start' })
    }
}

export const handleGroupCallOffer = async ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId, targetUserId, offer = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:offer' })
    if (!conversationId || !callId || !targetUserId || !offer) {
        return emitCallError('Thiếu conversationId hoặc callId hoặc targetUserId hoặc offer', { event: 'group-call:offer' })
    }

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:offer' })
        if (!membership.memberIds.includes(String(targetUserId))) {
            return emitCallError('targetUserId không thuộc conversation', { event: 'group-call:offer' })
        }

        forwardToUser(String(targetUserId), 'group-call:offer', {
            callId: String(callId),
            conversationId: String(conversationId),
            fromUserId,
            offer,
            timestamp: Date.now(),
        })
    } catch (e) {
        console.error('group-call:offer error', e)
        emitCallError('Lỗi hệ thống khi gửi offer nhóm', { event: 'group-call:offer' })
    }
}

export const handleGroupCallAnswer = async ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId, targetUserId, answer = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:answer' })
    if (!conversationId || !callId || !targetUserId || !answer) {
        return emitCallError('Thiếu conversationId hoặc callId hoặc targetUserId hoặc answer', { event: 'group-call:answer' })
    }

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:answer' })
        if (!membership.memberIds.includes(String(targetUserId))) {
            return emitCallError('targetUserId không thuộc conversation', { event: 'group-call:answer' })
        }

        forwardToUser(String(targetUserId), 'group-call:answer', {
            callId: String(callId),
            conversationId: String(conversationId),
            fromUserId,
            answer,
            timestamp: Date.now(),
        })
    } catch (e) {
        console.error('group-call:answer error', e)
        emitCallError('Lỗi hệ thống khi gửi answer nhóm', { event: 'group-call:answer' })
    }
}

export const handleGroupCallIceCandidate = async ({ io, socket, payload }) => {
    const { getSocketUserId, emitCallError, forwardToUser } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId, targetUserId, candidate = null } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:ice-candidate' })
    if (!conversationId || !callId || !targetUserId || !candidate) {
        return emitCallError('Thiếu conversationId hoặc callId hoặc targetUserId hoặc candidate', { event: 'group-call:ice-candidate' })
    }

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:ice-candidate' })
        if (!membership.memberIds.includes(String(targetUserId))) {
            return emitCallError('targetUserId không thuộc conversation', { event: 'group-call:ice-candidate' })
        }

        forwardToUser(String(targetUserId), 'group-call:ice-candidate', {
            callId: String(callId),
            conversationId: String(conversationId),
            fromUserId,
            candidate,
            timestamp: Date.now(),
        })
    } catch (e) {
        console.error('group-call:ice-candidate error', e)
        emitCallError('Lỗi hệ thống khi gửi ICE nhóm', { event: 'group-call:ice-candidate' })
    }
}

export const handleGroupCallJoin = async ({ io, socket, activeGroupCallRooms, payload }) => {
    const { getSocketUserId, emitCallError } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:join' })
    if (!conversationId) return emitCallError('Thiếu conversationId', { event: 'group-call:join' })

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:join' })

        const conversationKey = String(conversationId)
        const room = activeGroupCallRooms.get(conversationKey)
        if (!room) {
            return emitCallError('Không có cuộc gọi nhóm nào đang diễn ra', { event: 'group-call:join' })
        }

        if (callId && String(callId) !== String(room.callId)) {
            return emitCallError('callId không khớp với cuộc gọi đang diễn ra', { event: 'group-call:join' })
        }

        room.participants.add(String(fromUserId))

        socket.to(`conv:${String(conversationId)}`).emit('group-call:user-joined', {
            callId: String(room.callId),
            conversationId: String(conversationId),
            userId: fromUserId,
            timestamp: Date.now(),
        })

        socket.emit('group-call:ongoing', serializeActiveRoom(room))
        broadcastRoomOngoing(io, conversationKey, activeGroupCallRooms)
    } catch (e) {
        console.error('group-call:join error', e)
        emitCallError('Lỗi hệ thống khi join call nhóm', { event: 'group-call:join' })
    }
}

export const handleGroupCallLeave = async ({ io, socket, activeGroupCallRooms, payload }) => {
    const { getSocketUserId, emitCallError } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId, reason = 'left' } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:leave' })
    if (!conversationId || !callId) return emitCallError('Thiếu conversationId hoặc callId', { event: 'group-call:leave' })

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:leave' })

        const conversationKey = String(conversationId)
        const room = activeGroupCallRooms.get(conversationKey)
        if (room) {
            room.participants.delete(String(fromUserId))
        }

        socket.to(`conv:${String(conversationId)}`).emit('group-call:user-left', {
            callId: String(room?.callId || callId),
            conversationId: String(conversationId),
            userId: fromUserId,
            reason,
            timestamp: Date.now(),
        })

        if (room && room.participants.size === 0) {
            activeGroupCallRooms.delete(conversationKey)
            io.to(`conv:${String(conversationId)}`).emit('group-call:room-closed', {
                conversationId: String(conversationId),
                callId: String(room.callId),
                timestamp: Date.now(),
            })
        } else if (room) {
            broadcastRoomOngoing(io, conversationKey, activeGroupCallRooms)
        }
    } catch (e) {
        console.error('group-call:leave error', e)
        emitCallError('Lỗi hệ thống khi rời call nhóm', { event: 'group-call:leave' })
    }
}

export const handleGroupCallEnd = async ({ io, socket, activeGroupCallRooms, payload }) => {
    const { getSocketUserId, emitCallError } = createCallHelpers({ io, socket })
    const fromUserId = getSocketUserId()
    const { conversationId, callId, reason = 'ended' } = payload || {}

    if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'group-call:end' })
    if (!conversationId || !callId) return emitCallError('Thiếu conversationId hoặc callId', { event: 'group-call:end' })

    try {
        const membership = await getConversationMembership(conversationId, fromUserId)
        if (!membership.ok) return emitCallError(membership.message, { event: 'group-call:end' })

        const conversationKey = String(conversationId)
        const room = activeGroupCallRooms.get(conversationKey)
        if (room) {
            activeGroupCallRooms.delete(conversationKey)
        }

        io.to(`conv:${String(conversationId)}`).emit('group-call:ended', {
            callId: String(callId),
            conversationId: String(conversationId),
            fromUserId,
            reason,
            timestamp: Date.now(),
        })

        io.to(`conv:${String(conversationId)}`).emit('group-call:room-closed', {
            conversationId: String(conversationId),
            callId: String(room?.callId || callId),
            timestamp: Date.now(),
        })
    } catch (e) {
        console.error('group-call:end error', e)
        emitCallError('Lỗi hệ thống khi kết thúc call nhóm', { event: 'group-call:end' })
    }
}

export const handleDisconnect = async ({ io, socket, onlineUsers }) => {
    try {
        const uid = socket.data && socket.data.userId
        if (uid) {
            const lastSeen = Date.now()
            onlineUsers.delete(uid)
            const payload = { userId: String(uid), status: 'offline', lastSeen }
            io.emit('user_status', payload)
            try {
                await userRepository.updateLastSeen(String(uid), lastSeen)
            } catch (e) {
                console.error('Error updating user.lastSeen on disconnect', e)
            }
        }
    } catch (e) {
        console.error('Error handling disconnect', e)
    }
}
