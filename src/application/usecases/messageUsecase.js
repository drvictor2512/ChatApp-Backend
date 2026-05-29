import * as messageService from '../../services/messageService.js'

export const sendDirectMessage = (payload) => messageService.sendDirectMessage(payload)
export const sendGroupMessage = (payload) => messageService.sendGroupMessage(payload)
export const recallMessage = (payload) => messageService.recallMessage(payload)
export const reactToMessage = (payload) => messageService.reactToMessage(payload)
export const removeMessageReaction = (payload) => messageService.removeMessageReaction(payload)
export const togglePinMessage = (payload) => messageService.togglePinMessage(payload)
export const forwardMessage = (payload) => messageService.forwardMessage(payload)
