import express from 'express'
import { getAIConversation, getAIMessages, clearAIMessages } from '../controllers/aiController.js'

const aiRouter = express.Router()
aiRouter.get('/conversation', getAIConversation)
aiRouter.get('/messages', getAIMessages)
aiRouter.delete('/messages', clearAIMessages)

export default aiRouter