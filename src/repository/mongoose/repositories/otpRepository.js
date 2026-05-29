import OTP from '../models/OTP.js'

export const findByEmail = (email) => OTP.findOne({ email })

export const deleteByEmail = (email) => OTP.deleteOne({ email })

export const createOtp = (data) => OTP.create(data)
