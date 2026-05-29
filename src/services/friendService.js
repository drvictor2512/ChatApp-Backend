import { getUserByToken } from '../infrastructure/libs/verifyToken.js'
import { getIo } from '../infrastructure/libs/socket.js'
import { AppError } from '../shared/errors/AppError.js'
import {
    conversationRepository,
    friendRepository,
    friendRequestRepository,
    messageRepository,
    userRepository,
} from '../repository/mongoose/repositories/index.js'

const ensureTokenUser = async (token) => {
    if (!token) throw new AppError('Unauthorized', 401)
    try {
        return await getUserByToken(token)
    } catch (e) {
        throw new AppError(e.message, 401)
    }
}

export const sendFriendRequest = async ({ token, body }) => {
    const { to, message } = body || {}
    const user = await ensureTokenUser(token)
    const from = user._id

    if (!to) throw new AppError('Người dùng không tồn tại', 404)
    if (String(from) === String(to)) {
        throw new AppError('Không thể gửi yêu cầu kết bạn cho chính mình', 400)
    }

    const existingUser = await userRepository.findById(to)
    if (!existingUser) throw new AppError('Người dùng không tồn tại', 404)

    let userA = String(from)
    let userB = String(to)
    if (userA > userB) [userA, userB] = [userB, userA]

    const [alreadyFriends, existingRequest] = await Promise.all([
        friendRepository.findFriendship(userA, userB),
        friendRequestRepository.findExistingBetweenUsers(from, to),
    ])

    if (alreadyFriends) throw new AppError('Hai người đã là bạn bè', 400)
    if (existingRequest) throw new AppError('Yêu cầu kết bạn đã được gửi trước đó', 400)

    const request = await friendRequestRepository.createRequest({ fromUserId: from, toUserId: to, message })
    const populatedRequest = await friendRequestRepository.findByIdWithPopulate(request._id).lean()

    try {
        const io = getIo()
        if (io) io.to(`user:${to}`).emit('friend_request', { request: populatedRequest })
    } catch (e) { }

    return { message: 'Đã gửi yêu cầu kết bạn', request: populatedRequest }
}

export const acceptFriendRequest = async ({ token, requestId }) => {
    const user = await ensureTokenUser(token)

    const request = await friendRequestRepository.findById(requestId)
    if (!request) throw new AppError('Yêu cầu kết bạn không tồn tại', 404)

    if (String(request.toUserId) !== String(user._id)) {
        throw new AppError('Bạn không có quyền chấp nhận yêu cầu kết bạn này', 403)
    }

    await friendRepository.createFriendship({
        userIdA: request.fromUserId,
        userIdB: request.toUserId,
    })

    await friendRequestRepository.deleteById(requestId)

    const from = await userRepository.findByIdLean(request.fromUserId, '_id email name avatarUrl')
    const toUser = await userRepository.findByIdLean(request.toUserId, '_id email name avatarUrl')

    let conversation = await conversationRepository.findDirectBetweenUsersExact(request.fromUserId, request.toUserId)

    let populatedSystemMessage = null
    if (!conversation) {
        conversation = await conversationRepository.createDirectConversation({
            type: 'DIRECT',
            participants: [{ userId: request.fromUserId }, { userId: request.toUserId }],
        })

        const friendshipSystemContent = `${from?.name || 'Bạn'} và ${toUser?.name || 'Bạn'} đã trở thành bạn bè`
        const systemMessage = await messageRepository.createMessage({
            conversationId: conversation._id,
            senderId: request.fromUserId,
            content: friendshipSystemContent,
            isSystem: true,
        })

        conversation.lastMessage = {
            _id: systemMessage._id,
            content: systemMessage.content,
            senderId: request.fromUserId,
            createdAt: systemMessage.createdAt,
        }
        conversation.lastMessageAt = systemMessage.createdAt
        await conversation.save()

        populatedSystemMessage = await messageRepository.populateMessageById(systemMessage._id)
    }

    await conversation.populate([
        { path: 'participants.userId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' },
        { path: 'lastMessage.senderId', select: 'name avatarUrl email' },
    ])

    try {
        const io = getIo()
        if (io) {
            io.to(`user:${request.fromUserId}`).emit('friend_accepted', { friend: toUser, conversation })
            io.to(`user:${request.toUserId}`).emit('friend_accepted', { friend: from, conversation })
            if (populatedSystemMessage) {
                io.to(`user:${request.fromUserId}`).emit('new_message', populatedSystemMessage)
                io.to(`user:${request.toUserId}`).emit('new_message', populatedSystemMessage)
            }
        }
    } catch (e) { }

    return {
        message: 'Đã chấp nhận yêu cầu kết bạn',
        newFriend: {
            _id: from?._id,
            email: from?.email,
            name: from?.name,
            avatarUrl: from?.avatarUrl,
        },
        conversation,
    }
}

export const declineFriendRequest = async ({ token, requestId }) => {
    const user = await ensureTokenUser(token)

    const request = await friendRequestRepository.findById(requestId)
    if (!request) throw new AppError('Yêu cầu kết bạn không tồn tại', 404)

    if (String(request.toUserId) !== String(user._id)) {
        throw new AppError('Bạn không có quyền từ chối yêu cầu kết bạn này', 403)
    }

    const senderId = request.fromUserId
    await friendRequestRepository.deleteById(requestId)

    try {
        const io = getIo()
        if (io) io.to(`user:${senderId}`).emit('friend_declined', { requestId })
    } catch (e) { }

    return { message: 'Đã từ chối yêu cầu kết bạn' }
}

export const revokeFriendRequest = async ({ token, requestId }) => {
    const user = await ensureTokenUser(token)

    const request = await friendRequestRepository.findById(requestId)
    if (!request) throw new AppError('Yêu cầu kết bạn không tồn tại', 404)

    if (String(request.fromUserId) !== String(user._id)) {
        throw new AppError('Bạn không có quyền thu hồi lời mời này', 403)
    }

    const receiverId = request.toUserId
    await friendRequestRepository.deleteById(requestId)

    try {
        const io = getIo()
        if (io) {
            io.to(`user:${receiverId}`).emit('friend_request_cancelled', { requestId })
            io.to(`user:${receiverId}`).emit('friend_request_revoked', { requestId })
            io.to(`user:${receiverId}`).emit('friend_request_cancel', { requestId })
        }
    } catch (e) { }

    return { message: 'Đã thu hồi lời mời kết bạn', requestId }
}

export const getAllFriends = async ({ token }) => {
    const user = await ensureTokenUser(token)

    const friendships = await friendRepository.findFriendsByUserId(user._id)
    if (!friendships || friendships.length === 0) {
        return { friends: [] }
    }

    const friends = friendships.map((f) =>
        String(f.userIdA._id) === String(user._id) ? f.userIdB : f.userIdA,
    )

    return { friends }
}

export const getFriendsRequest = async ({ token }) => {
    const user = await ensureTokenUser(token)

    const populateFields = '_id email name avatarUrl'
    const [sent, receive] = await Promise.all([
        friendRequestRepository.findSentRequests(user._id, populateFields),
        friendRequestRepository.findReceivedRequests(user._id, populateFields),
    ])

    return { sent, receive }
}

export const unfriend = async ({ token, otherUserId }) => {
    const user = await ensureTokenUser(token)

    if (String(user._id) === String(otherUserId)) {
        throw new AppError('Không thể huỷ kết bạn với chính mình', 400)
    }

    let userA = String(user._id)
    let userB = String(otherUserId)
    if (userA > userB) [userA, userB] = [userB, userA]

    const deleted = await friendRepository.deleteFriendship(userA, userB)
    if (!deleted) throw new AppError('Bạn không phải là bạn của người này', 404)

    try {
        const io = getIo()
        if (io) io.to(`user:${otherUserId}`).emit('unfriended', { userId: String(user._id) })
    } catch (e) { }

    return { message: 'Đã huỷ kết bạn' }
}
