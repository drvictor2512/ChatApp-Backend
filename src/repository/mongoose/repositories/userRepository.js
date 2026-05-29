import User from '../models/User.js'

export const findByEmail = (email) => User.findOne({ email })

export const findById = (id) => User.findById(id)

export const findByIdSelect = (id, select) => User.findById(id).select(select)

export const findByIdsSelect = (ids, select) => User.find({ _id: { $in: ids } }).select(select)

export const findByEmailSelect = (email, select) => User.findOne({ email }).select(select)

export const findByIdLean = (id, select) => User.findById(id).select(select).lean()

export const findByEmailLean = (email, select) => User.findOne({ email }).select(select).lean()

export const createUser = (data) => User.create(data)

export const updatePasswordByEmail = (email, password) => User.updateOne({ email }, { password })

export const updateById = (id, update) => User.findByIdAndUpdate(id, update, { new: true })

export const updateByEmail = (email, update) => User.updateOne({ email }, update)

export const deleteById = (id) => User.deleteOne({ _id: id })

export const updateLastSeen = (id, lastSeen) => User.findByIdAndUpdate(id, { lastSeen }, { upsert: false })
