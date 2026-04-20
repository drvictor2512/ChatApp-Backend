// Soket để quản lý trạng thái online/offline của người dùng, sự kiện cuộc trò chuyện và chat AI
import User from '../models/User.js'
import Conversation from '../models/Conversation.js'
import { handleAIMessage } from '../controllers/aiController.js'

const onlineUsers = new Map()
const activeGroupCallRooms = new Map()

export function initSockets(io) {
    if (!io) return
    io.on('connection', (socket) => {
        const getSocketUserId = () => (socket.data && socket.data.userId ? String(socket.data.userId) : null)

        const emitCallError = (message, extra = {}) => {
            socket.emit('call:error', { message, ...extra })
        }

        const forwardToUser = (targetUserId, event, payload) => {
            if (!targetUserId) return
            io.to(`user:${String(targetUserId)}`).emit(event, payload)
        }

        const serializeActiveRoom = (room) => ({
            callId: String(room.callId),
            conversationId: String(room.conversationId),
            groupName: room.groupName || 'Nhóm chat',
            memberCount: room.participants.size,
            callType: room.callType || 'video',
            startedAt: Number(room.startedAt || Date.now()),
        })

        const broadcastRoomOngoing = (conversationId) => {
            const room = activeGroupCallRooms.get(String(conversationId))
            if (!room) return
            io.to(`conv:${String(conversationId)}`).emit('group-call:ongoing', serializeActiveRoom(room))
        }

        const getConversationMembership = async (conversationId, userId) => {
            if (!conversationId || !userId) return { ok: false, message: 'Thiếu conversationId hoặc userId' }

            const conversation = await Conversation.findById(String(conversationId)).select('_id type participants.userId').lean()
            if (!conversation) return { ok: false, message: 'Cuộc trò chuyện không tồn tại' }

            const memberIds = (conversation.participants || []).map(p => String(p?.userId)).filter(Boolean)
            if (!memberIds.includes(String(userId))) {
                return { ok: false, message: 'Bạn không phải thành viên cuộc trò chuyện' }
            }

            return { ok: true, conversation, memberIds }
        }

        socket.on('join', async ({ userId } = {}) => {
            if (userId) {
                socket.join(`user:${userId}`)
                socket.data.userId = String(userId)
                onlineUsers.set(String(userId), { status: 'online', lastSeen: null })
                const payload = { userId: String(userId), status: 'online', lastSeen: null }
                console.log('[socket] join ->', payload)
                io.emit('user_status', payload)
                // Auto-join các phòng trò chuyện mà userId tham gia để nhận được tin nhắn mới ngay lập tức
                try {
                    const userConvs = await Conversation.find({ 'participants.userId': String(userId) }).select('_id').lean()
                    userConvs.forEach(c => socket.join(`conv:${c._id}`))
                } catch (e) { console.error('Error auto-joining conv rooms', e) }
                try {
                    // Lấy danh sách tất cả người dùng đã từng tham gia trò chuyện với userId để gửi trạng thái online của họ
                    const convs = await Conversation.find({ 'participants.userId': String(userId) }).select('participants').lean()
                    const participantIds = new Set()
                    convs.forEach(c => {
                        (c.participants || []).forEach(p => {
                            if (p && String(p.userId) !== String(userId)) participantIds.add(String(p.userId))
                        })
                    })
                    const ids = Array.from(participantIds)
                    const users = []
                    let docs = []
                    if (ids.length > 0) {
                        docs = await User.find({ _id: { $in: ids } }).select('_id lastSeen').lean()
                        const idsSet = new Set(docs.map(d => String(d._id)))
                        ids.forEach(id => {
                            const info = onlineUsers.get(String(id))
                            if (info) {
                                users.push({ userId: String(id), status: info.status, lastSeen: info.lastSeen })
                            } else if (idsSet.has(String(id))) {
                                const doc = docs.find(d => String(d._id) === String(id))
                                users.push({ userId: String(id), status: 'offline', lastSeen: doc ? doc.lastSeen : null })
                            } else {
                                users.push({ userId: String(id), status: 'offline', lastSeen: null })
                            }
                        })
                    }
                    socket.emit('online_users', { users })
                    console.log('[socket] online_users -> sent', users.length, 'items to', String(userId))
                } catch (e) {
                    console.error('Error sending online_users to socket', e)
                }
            }
        })

        socket.on('joinConversation', ({ conversationId } = {}) => {
            if (conversationId) socket.join(`conv:${conversationId}`)
        })

        socket.on('leaveConversation', ({ conversationId } = {}) => {
            if (conversationId) socket.leave(`conv:${conversationId}`)
        })

        // AI chat: client phát ai_message { token, content, file? }
        // Server phát lại: ai_user_message → ai_chunk (nhiều lần) → ai_done  hoặc ai_error
        socket.on('ai_message', (data) => {
            handleAIMessage(socket, data || {}).catch(err => {
                console.error('[socket] ai_message uncaught error:', err)
                socket.emit('ai_error', { message: err.message || 'Lỗi hệ thống' })
            })
        })

        // Video call signaling (WebRTC): server nhận signal và chuyển tiếp cho user đích.
        socket.on('call:invite', (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { targetUserId, callId, conversationId = null, offer = null, metadata = null } = payload

            if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:invite' })
            if (!targetUserId || !callId || !offer) return emitCallError('Thiếu targetUserId hoặc callId hoặc offer', { event: 'call:invite' })

            forwardToUser(String(targetUserId), 'call:incoming', {
                callId: String(callId),
                conversationId: conversationId ? String(conversationId) : null,
                fromUserId,
                offer,
                metadata,
                timestamp: Date.now()
            })
        })

        socket.on('call:answer', (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { targetUserId, callId, answer = null } = payload

            if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:answer' })
            if (!targetUserId || !callId || !answer) return emitCallError('Thiếu targetUserId hoặc callId hoặc answer', { event: 'call:answer' })

            forwardToUser(String(targetUserId), 'call:answered', {
                callId: String(callId),
                fromUserId,
                answer,
                timestamp: Date.now()
            })
        })

        socket.on('call:ice-candidate', (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { targetUserId, callId, candidate = null } = payload

            if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:ice-candidate' })
            if (!targetUserId || !callId || !candidate) return emitCallError('Thiếu targetUserId hoặc callId hoặc candidate', { event: 'call:ice-candidate' })

            forwardToUser(String(targetUserId), 'call:ice-candidate', {
                callId: String(callId),
                fromUserId,
                candidate,
                timestamp: Date.now()
            })
        })

        socket.on('call:reject', (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { targetUserId, callId, reason = 'rejected' } = payload

            if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:reject' })
            if (!targetUserId || !callId) return emitCallError('Thiếu targetUserId hoặc callId', { event: 'call:reject' })

            forwardToUser(String(targetUserId), 'call:rejected', {
                callId: String(callId),
                fromUserId,
                reason,
                timestamp: Date.now()
            })
        })

        socket.on('call:end', (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { targetUserId, callId, reason = 'ended' } = payload

            if (!fromUserId) return emitCallError('Bạn chưa join socket với userId', { event: 'call:end' })
            if (!targetUserId || !callId) return emitCallError('Thiếu targetUserId hoặc callId', { event: 'call:end' })

            forwardToUser(String(targetUserId), 'call:ended', {
                callId: String(callId),
                fromUserId,
                reason,
                timestamp: Date.now()
            })
        })

        // Group call signaling (mesh): frontend gửi/nhận signal theo từng peer trong cùng conversation group.
        socket.on('group-call:start', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId, metadata = null } = payload

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
                    broadcastRoomOngoing(conversationKey)
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
                    timestamp: Date.now()
                })

                broadcastRoomOngoing(conversationKey)
            } catch (e) {
                console.error('group-call:start error', e)
                emitCallError('Lỗi hệ thống khi bắt đầu call nhóm', { event: 'group-call:start' })
            }
        })

        socket.on('group-call:offer', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId, targetUserId, offer = null } = payload

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
                    timestamp: Date.now()
                })
            } catch (e) {
                console.error('group-call:offer error', e)
                emitCallError('Lỗi hệ thống khi gửi offer nhóm', { event: 'group-call:offer' })
            }
        })

        socket.on('group-call:answer', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId, targetUserId, answer = null } = payload

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
                    timestamp: Date.now()
                })
            } catch (e) {
                console.error('group-call:answer error', e)
                emitCallError('Lỗi hệ thống khi gửi answer nhóm', { event: 'group-call:answer' })
            }
        })

        socket.on('group-call:ice-candidate', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId, targetUserId, candidate = null } = payload

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
                    timestamp: Date.now()
                })
            } catch (e) {
                console.error('group-call:ice-candidate error', e)
                emitCallError('Lỗi hệ thống khi gửi ICE nhóm', { event: 'group-call:ice-candidate' })
            }
        })

        socket.on('group-call:join', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId } = payload

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
                    timestamp: Date.now()
                })

                socket.emit('group-call:ongoing', serializeActiveRoom(room))
                broadcastRoomOngoing(conversationKey)
            } catch (e) {
                console.error('group-call:join error', e)
                emitCallError('Lỗi hệ thống khi join call nhóm', { event: 'group-call:join' })
            }
        })

        socket.on('group-call:leave', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId, reason = 'left' } = payload

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
                    timestamp: Date.now()
                })

                if (room && room.participants.size === 0) {
                    activeGroupCallRooms.delete(conversationKey)
                    io.to(`conv:${String(conversationId)}`).emit('group-call:room-closed', {
                        conversationId: String(conversationId),
                        callId: String(room.callId),
                        timestamp: Date.now(),
                    })
                } else if (room) {
                    broadcastRoomOngoing(conversationKey)
                }
            } catch (e) {
                console.error('group-call:leave error', e)
                emitCallError('Lỗi hệ thống khi rời call nhóm', { event: 'group-call:leave' })
            }
        })

        socket.on('group-call:end', async (payload = {}) => {
            const fromUserId = getSocketUserId()
            const { conversationId, callId, reason = 'ended' } = payload

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
                    timestamp: Date.now()
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
        })

        socket.on('disconnect', async () => {
            try {
                const uid = socket.data && socket.data.userId
                if (uid) {
                    const lastSeen = Date.now()
                    onlineUsers.delete(uid)
                    const payload = { userId: String(uid), status: 'offline', lastSeen }
                    io.emit('user_status', payload)
                    try {
                        await User.findByIdAndUpdate(String(uid), { lastSeen }, { upsert: false }).exec()
                    } catch (e) {
                        console.error('Error updating user.lastSeen on disconnect', e)
                    }
                }
            } catch (e) {
                console.error('Error handling disconnect', e)
            }
        })
    })
}

export function getOnlineUsers() {
    return onlineUsers
}
export default { initSockets, getOnlineUsers }
