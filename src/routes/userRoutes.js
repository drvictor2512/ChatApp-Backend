import express from 'express'
import upload from '../middlewares/upload.js'
import { updateProfile, uploadAvatar, uploadBanner, getProfile } from '../controllers/userController.js'

const router = express.Router()

// Update basic profile fields (name, dateOfBirth, bio)
router.put('/profile', updateProfile)

// Get current user profile
router.get('/profile', getProfile)

// Upload avatar image (field name: 'image')
router.post('/avatar', (req, res, next) => upload(req, res, next), uploadAvatar)
// Upload banner image (field name: 'image')
router.post('/banner', (req, res, next) => upload(req, res, next), uploadBanner)

export default router
