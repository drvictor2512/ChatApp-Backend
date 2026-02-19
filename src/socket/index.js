// Soket để quản lý trạng thái online/offline của người dùng và các sự kiện liên quan đến cuộc trò chuyện
import User from '../models/User.js'
import Conversation from '../models/Conversation.js'

const onlineUsers = new Map()

export function initSockets(io) {
    if (!io) return
    io.on('connection', (socket) => {
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
                    // Ngoài ra gửi cả những người dùng online khác không cùng tham gia trò chuyện nhưng đã từng tham gia trò chuyện với userId để cập nhật trạng thái online của họ
                    Array.from(onlineUsers.entries()).forEach(([id, info]) => {
                        if (!participantIds.has(String(id))) users.push({ userId: id, status: info.status, lastSeen: info.lastSeen })
                    })
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
