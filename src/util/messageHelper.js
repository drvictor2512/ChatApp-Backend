export const updateConversationAfterCreateMessage = async (conversation, message, senderId) => {
    const normalizedUnreadCounts = conversation.unreadCounts instanceof Map
        ? conversation.unreadCounts
        : new Map(Object.entries(conversation.unreadCounts || {}))

    conversation.unreadCounts = normalizedUnreadCounts

    conversation.set({
        lastMessageAt: message.createdAt,
        lastMessage: {
            _id: message._id,
            content: message.content,
            fileUrl: message.fileUrl,
            fileUrls: Array.isArray(message.fileUrls) ? message.fileUrls : [],
            senderId,
            createdAt: message.createdAt
        }
    })

    ;(conversation.participants || []).forEach(p => {
        const memberId = String(p?.userId?._id || p?.userId || '')
        if (!memberId) return
        const isSender = memberId === senderId.toString()
        const prevCount = conversation.unreadCounts.get(memberId) || 0
        conversation.unreadCounts.set(memberId, isSender ? 0 : prevCount + 1)
    })
}