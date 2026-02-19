import express from 'express'
import { sendDirectMessage, sendGroupMessage, recallMessage } from '../controllers/messageController.js';
import upload from '../middlewares/upload.js';
import checkGroupMember from '../middlewares/checkGroupMember.js';

const messageRouter = express.Router();
messageRouter.post('/direct', upload, sendDirectMessage)
messageRouter.post('/group', upload, checkGroupMember, sendGroupMessage)
messageRouter.patch('/:messageId/recall', recallMessage)

export default messageRouter;