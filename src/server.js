import 'dotenv/config';
import express from 'express';
import http from 'http'
import { Server } from 'socket.io'
import { connectDB } from './libs/db.js';
import cors from 'cors';
import authRouter from './routes/authRoutes.js';
import userRouter from './routes/userRoutes.js';
import expireHandler from './middlewares/expireHandler.js';
import friendRouter from './routes/friendRoutes.js';
import messageRouter from './routes/messageRoutes.js';
import conversationRouter from './routes/conversationRoutes.js';
import { setIo } from './libs/socket.js'
import { initSockets } from './socket/index.js'
import aiRouter from './routes/aiRoutes.js';
import job from './libs/cron.js';

job.start()
const app = express();
const PORT = process.env.PORT || 3000;
const bodyParser = express.json();

app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', "http://localhost:5174"],
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
            origin: ['http://localhost:5173', "http://localhost:5174"],
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

