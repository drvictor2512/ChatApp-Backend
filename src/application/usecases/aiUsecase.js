import * as aiService from '../../services/aiService.js'

export const getAIConversation = (payload) => aiService.getAIConversation(payload)
export const clearAIMessages = (payload) => aiService.clearAIMessages(payload)
export const getAIMessages = (payload) => aiService.getAIMessages(payload)
export const handleAIMessage = (socket, payload) => aiService.handleAIMessage(socket, payload)
export { AI_BOT_ID } from '../../services/aiService.js'
