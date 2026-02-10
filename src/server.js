import 'dotenv/config';
import express from 'express';
import { connectDB } from './libs/db.js';
import cors from 'cors';
import authRouter from './routes/authRoutes.js';
import userRouter from './routes/userRoutes.js';
import expireHandler from './middlewares/expireHandler.js';
import friendRouter from './routes/friendRoutes.js';
const app = express();
const PORT = process.env.PORT || 3000;
const bodyParser = express.json();

app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser)

app.use(expireHandler)
app.use('/auth', authRouter)
app.use('/user', userRouter)
app.use('/friends', friendRouter)
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    })
})

