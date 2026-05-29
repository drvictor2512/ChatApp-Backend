import 'dotenv/config';
import express from 'express';
import http from 'http'
import { Server } from 'socket.io'
import { connectDB } from './infrastructure/libs/db.js';
import cors from 'cors';
import authRouter from './presentation/http/routes/authRoutes.js';
import userRouter from './presentation/http/routes/userRoutes.js';
import expireHandler from './presentation/http/middlewares/expireHandler.js';
import friendRouter from './presentation/http/routes/friendRoutes.js';
import messageRouter from './presentation/http/routes/messageRoutes.js';
import conversationRouter from './presentation/http/routes/conversationRoutes.js';
import { setIo } from './infrastructure/libs/socket.js'
import { initSockets } from './presentation/socket/index.js'
import aiRouter from './presentation/http/routes/aiRoutes.js';
import job from './infrastructure/libs/cron.js';

job.start()
const app = express();
const PORT = process.env.PORT || 3000;
const bodyParser = express.json();

app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser)

app.use(expireHandler)
app.use('/auth', authRouter)
app.use('/user', userRouter)
app.use('/friends', friendRouter)
app.use('/messages', messageRouter)
app.use('/conversations', conversationRouter)
app.use('/ai', aiRouter)
connectDB().then(() => {
    const server = http.createServer(app)
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    })

    // Khởi tạo socket và các sự kiện liên quan
    initSockets(io)

    // Lưu đối tượng io để sử dụng trong các module khác
    setIo(io)

    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    })
})

