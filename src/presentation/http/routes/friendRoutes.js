import express from 'express';
import { acceptFriendRequest, declineFriendRequest, getAllFriends, getFriendsRequest, revokeFriendRequest, sendFriendRequest, unfriend } from '../controllers/friendController.js';

const friendRouter = express.Router();
friendRouter.post('/requests', sendFriendRequest)
friendRouter.delete('/requests/:requestId', revokeFriendRequest)
friendRouter.post('/requests/:requestId/accept', acceptFriendRequest)
friendRouter.post('/requests/:requestId/decline', declineFriendRequest)
friendRouter.get('/', getAllFriends)
friendRouter.get('/requests', getFriendsRequest)
friendRouter.delete('/:otherUserId', unfriend)
export default friendRouter;
