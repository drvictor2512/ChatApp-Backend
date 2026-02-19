import express from 'express';
import { createConversation, getConversations, getMessages, renameGroup, addGroupMember, removeGroupMember, assignDeputy, deleteGroup, leaveGroup, markAsRead, getInviteLink, joinByInvite, transferOwnership } from '../controllers/conversationController.js';
import checkGroupMember from '../middlewares/checkGroupMember.js'
import checkGroupAdmin, { checkGroupOwner } from '../middlewares/checkGroupAdmin.js';

const conversationRouter = express.Router()
conversationRouter.post('/', createConversation)
conversationRouter.get('/', getConversations)
conversationRouter.get('/:conversationId/messages', getMessages)
conversationRouter.patch('/:conversationId/read', markAsRead)
conversationRouter.get('/:conversationId/invite', getInviteLink)

// group management
conversationRouter.post('/group/rename', checkGroupAdmin, renameGroup)
conversationRouter.post('/group/add-member', checkGroupMember, addGroupMember)
conversationRouter.post('/group/remove-member', checkGroupAdmin, removeGroupMember)
conversationRouter.post('/group/assign-deputy', checkGroupOwner, assignDeputy)
conversationRouter.post('/group/leave', checkGroupMember, leaveGroup)
conversationRouter.post('/group/join-invite', joinByInvite)
conversationRouter.post('/group/transfer-owner', transferOwnership)
conversationRouter.delete('/group/:conversationId', checkGroupOwner, deleteGroup)

export default conversationRouter;
