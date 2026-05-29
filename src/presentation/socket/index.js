// Soket để quản lý trạng thái online/offline của người dùng, sự kiện cuộc trò chuyện và chat AI
import {
    handleJoin,
    handleJoinConversation,
    handleLeaveConversation,
    handleAIMessage,
    handleCallInvite,
    handleCallAnswer,
    handleCallIceCandidate,
    handleCallReject,
    handleCallEnd,
    handleGroupCallStart,
    handleGroupCallOffer,
    handleGroupCallAnswer,
    handleGroupCallIceCandidate,
    handleGroupCallJoin,
    handleGroupCallLeave,
    handleGroupCallEnd,
    handleDisconnect,
} from '../../application/usecases/socketUsecase.js'

const onlineUsers = new Map()
const activeGroupCallRooms = new Map()

export function initSockets(io) {
    if (!io) return
    io.on('connection', (socket) => {
        socket.on('join', async ({ userId } = {}) => {
            await handleJoin({ io, socket, userId, onlineUsers })
        })

        socket.on('joinConversation', ({ conversationId } = {}) => {
            handleJoinConversation({ socket, conversationId })
        })

        socket.on('leaveConversation', ({ conversationId } = {}) => {
            handleLeaveConversation({ socket, conversationId })
        })

        // AI chat: client phát ai_message { token, content, file? }
        // Server phát lại: ai_user_message → ai_chunk (nhiều lần) → ai_done  hoặc ai_error
        socket.on('ai_message', (data) => {
            handleAIMessage({ socket, data }).catch((err) => {
                console.error('[socket] ai_message uncaught error:', err)
                socket.emit('ai_error', { message: err.message || 'Lỗi hệ thống' })
            })
        })

        // Video call signaling (WebRTC): server nhận signal và chuyển tiếp cho user đích.
        socket.on('call:invite', (payload = {}) => {
            handleCallInvite({ io, socket, payload })
        })

        socket.on('call:answer', (payload = {}) => {
            handleCallAnswer({ io, socket, payload })
        })

        socket.on('call:ice-candidate', (payload = {}) => {
            handleCallIceCandidate({ io, socket, payload })
        })

        socket.on('call:reject', (payload = {}) => {
            handleCallReject({ io, socket, payload })
        })

        socket.on('call:end', (payload = {}) => {
            handleCallEnd({ io, socket, payload })
        })

        // Group call signaling (mesh): frontend gửi/nhận signal theo từng peer trong cùng conversation group.
        socket.on('group-call:start', async (payload = {}) => {
            await handleGroupCallStart({ io, socket, activeGroupCallRooms, payload })
        })

        socket.on('group-call:offer', async (payload = {}) => {
            await handleGroupCallOffer({ io, socket, payload })
        })

        socket.on('group-call:answer', async (payload = {}) => {
            await handleGroupCallAnswer({ io, socket, payload })
        })

        socket.on('group-call:ice-candidate', async (payload = {}) => {
            await handleGroupCallIceCandidate({ io, socket, payload })
        })

        socket.on('group-call:join', async (payload = {}) => {
            await handleGroupCallJoin({ io, socket, activeGroupCallRooms, payload })
        })

        socket.on('group-call:leave', async (payload = {}) => {
            await handleGroupCallLeave({ io, socket, activeGroupCallRooms, payload })
        })

        socket.on('group-call:end', async (payload = {}) => {
            await handleGroupCallEnd({ io, socket, activeGroupCallRooms, payload })
        })

        socket.on('disconnect', async () => {
            await handleDisconnect({ io, socket, onlineUsers })
        })
    })
}

export function getOnlineUsers() {
    return onlineUsers
}
export default { initSockets, getOnlineUsers }
