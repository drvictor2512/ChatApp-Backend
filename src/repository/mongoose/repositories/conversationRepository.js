import Conversation from '../models/Conversation.js'

export const findById = (id) => Conversation.findById(id)

export const findByIdSelect = (id, select) => Conversation.findById(id).select(select)

export const findDirectBetweenUsers = (userId, participantId) => {
    return Conversation.findOne({
        type: 'DIRECT',
        'participants.userId': { $all: [userId, participantId] },
    })
}

export const findDirectBetweenUsersExact = (userId, participantId) => {
    return Conversation.findOne({
        type: 'DIRECT',
        'participants.userId': { $all: [userId, participantId] },
        $expr: { $eq: [{ $size: '$participants' }, 2] },
    })
}

export const createDirectConversation = (data) => Conversation.create(data)

export const createGroupConversation = (data) => Conversation.create(data)

export const findByParticipantUserId = (userId) => Conversation.find({ 'participants.userId': userId })

export const findGroupByInviteCode = (inviteCode) => Conversation.findOne({ type: 'GROUP', 'group.inviteCode': inviteCode })

export const existsInviteCode = (inviteCode) => Conversation.exists({ type: 'GROUP', 'group.inviteCode': inviteCode })

export const findDirectConversationIdsByUser = (userId) => {
    return Conversation.find({ type: 'DIRECT', 'participants.userId': userId }).select('_id').lean()
}

export const findGroupConversationsByUser = (userId) => {
    return Conversation.find({ type: 'GROUP', 'participants.userId': userId })
}

export const deleteById = (conversationId) => Conversation.findByIdAndDelete(conversationId)

export const deleteManyByIds = (conversationIds) => Conversation.deleteMany({ _id: { $in: conversationIds } })

export const updateUnreadCount = (conversationId, userId) => {
    return Conversation.findByIdAndUpdate(conversationId, { [`unreadCounts.${userId}`]: 0 })
}

export const findAIConversationByUser = (userId) => Conversation.findOne({ 'participants.userId': userId, isAI: true })

export const findAIConversationByIdForUser = (conversationId, userId) => {
    return Conversation.findOne({ _id: conversationId, isAI: true, 'participants.userId': userId })
}
