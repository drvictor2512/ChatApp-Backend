import express from 'express'
import { sendDirectMessage, sendGroupMessage, recallMessage, reactToMessage, removeMessageReaction, togglePinMessage, forwardMessage } from '../controllers/messageController.js';
import { uploadMultiple } from '../middlewares/upload.js';
import checkGroupMember from '../middlewares/checkGroupMember.js';

const messageRouter = express.Router();
messageRouter.post('/direct', uploadMultiple, sendDirectMessage)
messageRouter.post('/group', uploadMultiple, checkGroupMember, sendGroupMessage)
messageRouter.post('/forward', forwardMessage)
messageRouter.patch('/:messageId/recall', recallMessage)
messageRouter.patch('/:messageId/reaction', reactToMessage)
messageRouter.delete('/:messageId/reaction', removeMessageReaction)
messageRouter.patch('/:messageId/pin', togglePinMessage)

export default messageRouter;