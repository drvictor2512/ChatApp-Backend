import * as friendService from '../../services/friendService.js'

export const sendFriendRequest = (payload) => friendService.sendFriendRequest(payload)
export const acceptFriendRequest = (payload) => friendService.acceptFriendRequest(payload)
export const declineFriendRequest = (payload) => friendService.declineFriendRequest(payload)
export const revokeFriendRequest = (payload) => friendService.revokeFriendRequest(payload)
export const getAllFriends = (payload) => friendService.getAllFriends(payload)
export const getFriendsRequest = (payload) => friendService.getFriendsRequest(payload)
export const unfriend = (payload) => friendService.unfriend(payload)
