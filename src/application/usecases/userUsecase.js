import * as userService from '../../services/userService.js'

export const searchUserByEmail = (payload) => userService.searchUserByEmail(payload)
export const updateProfile = (payload) => userService.updateProfile(payload)
export const uploadAvatar = (payload) => userService.uploadAvatar(payload)
export const uploadBanner = (payload) => userService.uploadBanner(payload)
export const getProfile = (payload) => userService.getProfile(payload)
export const getUserById = (payload) => userService.getUserById(payload)
export const blockUser = (payload) => userService.blockUser(payload)
export const unblockUser = (payload) => userService.unblockUser(payload)
export const getBlockedUsers = (payload) => userService.getBlockedUsers(payload)
export const getBlockStatus = (payload) => userService.getBlockStatus(payload)
