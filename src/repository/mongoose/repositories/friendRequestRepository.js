import FriendRequest from '../models/FriendRequest.js'

export const deleteByUserId = (userId) => FriendRequest.deleteMany({ $or: [{ fromUserId: userId }, { toUserId: userId }] })

export const createRequest = (data) => FriendRequest.create(data)

export const findById = (requestId) => FriendRequest.findById(requestId)

export const findByIdWithPopulate = (requestId) => {
	return FriendRequest.findById(requestId)
		.populate('fromUserId', '_id name avatarUrl email')
		.populate('toUserId', '_id name avatarUrl email')
}

export const deleteById = (requestId) => FriendRequest.findByIdAndDelete(requestId)

export const findExistingBetweenUsers = (fromUserId, toUserId) => {
	return FriendRequest.findOne({
		$or: [
			{ fromUserId, toUserId },
			{ fromUserId: toUserId, toUserId: fromUserId },
		],
	})
}

export const findSentRequests = (userId, select = '_id email name avatarUrl') => {
	return FriendRequest.find({ fromUserId: userId }).populate('toUserId', select).lean()
}

export const findReceivedRequests = (userId, select = '_id email name avatarUrl') => {
	return FriendRequest.find({ toUserId: userId }).populate('fromUserId', select).lean()
}
