import express from 'express'
import { sendDirectMessage, sendGroupMessage, recallMessage } from '../controllers/messageController.js';
import { uploadMultiple } from '../middlewares/upload.js';
import checkGroupMember from '../middlewares/checkGroupMember.js';

const messageRouter = express.Router();
messageRouter.post('/direct', uploadMultiple, sendDirectMessage)
messageRouter.post('/group', uploadMultiple, checkGroupMember, sendGroupMessage)
messageRouter.patch('/:messageId/recall', recallMessage)

export default messageRouter;