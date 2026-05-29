import * as authService from '../../services/authService.js'

export const signUp = (payload) => authService.signUp(payload)
export const verifySignUpOTP = (payload) => authService.verifySignUpOTP(payload)
export const signIn = (payload) => authService.signIn(payload)
export const changePassword = (payload) => authService.changePassword(payload)
export const closeAccount = (payload) => authService.closeAccount(payload)
export const forgotPassword = (payload) => authService.forgotPassword(payload)
export const resetPassword = (payload) => authService.resetPassword(payload)
