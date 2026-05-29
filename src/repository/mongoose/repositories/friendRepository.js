import Friend from '../models/Friend.js'

export const findFriendship = (userIdA, userIdB) => Friend.findOne({ userIdA, userIdB })

export const deleteByUserId = (userId) => Friend.deleteMany({ $or: [{ userIdA: userId }, { userIdB: userId }] })

export const createFriendship = (data) => Friend.create(data)

export const findFriendsByUserId = (userId) => {
	return Friend.find({ $or: [{ userIdA: userId }, { userIdB: userId }] })
		.populate('userIdA userIdB', '_id email name avatarUrl')
		.lean()
}

export const deleteFriendship = (userIdA, userIdB) => Friend.findOneAndDelete({ userIdA, userIdB })
