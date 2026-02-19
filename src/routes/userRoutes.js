import express from 'express'
import upload from '../middlewares/upload.js'
import { updateProfile, uploadAvatar, uploadBanner, getProfile, searchUserByEmail, getUserById, blockUser, unblockUser, getBlockedUsers } from '../controllers/userController.js'

const router = express.Router()

// Update basic profile fields (name, dateOfBirth, bio)
router.put('/profile', updateProfile)

// Get current user profile
router.get('/profile', getProfile)

// Upload avatar image (field name: 'image')
router.post('/avatar', (req, res, next) => upload(req, res, next), uploadAvatar)
// Upload banner image (field name: 'image')
router.post('/banner', (req, res, next) => upload(req, res, next), uploadBanner)
// Search user by email (query ?email=...)
router.get('/search', searchUserByEmail)

// Block / unblock / list blocked
router.post('/block', blockUser)
router.post('/unblock', unblockUser)
router.get('/blocked', getBlockedUsers)

// Get any user's public profile by id
router.get('/:id', getUserById)

export default router
