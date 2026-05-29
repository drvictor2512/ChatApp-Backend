import Message from '../models/Message.js'

export const createMessage = (data) => Message.create(data)

export const findById = (id) => Message.findById(id)

export const deleteManyByConversationIds = (conversationIds) => Message.deleteMany({ conversationId: { $in: conversationIds } })

export const deleteManyByConversationId = (conversationId) => Message.deleteMany({ conversationId })

export const findMessages = (query, options = {}) => {
    const { sort = { createdAt: -1 }, limit = 0 } = options
    return Message.find(query).sort(sort).limit(limit)
}

export const findMessagesWithPopulate = (query, options = {}) => {
    const { sort = { createdAt: -1 }, limit = 0 } = options
    return Message.find(query)
        .sort(sort)
        .limit(limit)
        .populate({ path: 'senderId', select: 'name avatarUrl email dateOfBirth gender bannerUrl bio verified createdAt' })
        .populate({ path: 'reactions.userId', select: 'name avatarUrl' })
        .populate({ path: 'pinnedBy', select: 'name avatarUrl' })
        .populate({ path: 'replyTo', select: 'content fileUrl fileUrls senderId isRecalled createdAt' })
        .populate({ path: 'replyTo.senderId', select: 'name avatarUrl' })
        .populate({ path: 'forwardedFrom.originalSenderId', select: 'name avatarUrl' })
}

export const populateMessageById = (messageId) => {
    return Message.findById(messageId)
        .populate('senderId', 'name avatarUrl email dateOfBirth verified createdAt bio')
        .populate('reactions.userId', 'name avatarUrl')
        .populate('pinnedBy', 'name avatarUrl')
        .populate('replyTo', 'content fileUrl fileUrls senderId isRecalled createdAt')
        .populate('replyTo.senderId', 'name avatarUrl')
        .populate('forwardedFrom.originalSenderId', 'name avatarUrl')
}
