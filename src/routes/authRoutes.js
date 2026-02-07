import express from 'express';
import { signIn, signUp, signOut, changePassword, forgotPassword, resetPassword } from '../controllers/authController.js';
import { sendVerificationOTPEmail } from '../controllers/otpController.js';

const authRouter = express.Router();
// Signup route
authRouter.post('/signup', signUp)

// Signin route
authRouter.post('/signin', signIn)

// OTP send route
authRouter.post('/otp', sendVerificationOTPEmail)

// Signout route
authRouter.post('/signout', signOut)

// Change password route
authRouter.post('/change-password', changePassword)

// Forgot password route
authRouter.post('/forgot-password', forgotPassword);

// Reset password route
authRouter.post('/reset-password', resetPassword);

export default authRouter;