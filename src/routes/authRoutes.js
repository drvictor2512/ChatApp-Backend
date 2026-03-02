import express from 'express';
import { signIn, signUp, verifySignUpOTP, changePassword, forgotPassword, resetPassword } from '../controllers/authController.js';
import { sendVerificationOTPEmail } from '../controllers/otpController.js';

const authRouter = express.Router();
// Signup route
authRouter.post('/signup', signUp)

// Verify OTP after signup route
authRouter.post('/verify-otp', verifySignUpOTP)

// Signin route
authRouter.post('/signin', signIn)

// OTP send route
authRouter.post('/otp', sendVerificationOTPEmail)

// Change password route
authRouter.post('/change-password', changePassword)

// Forgot password route
authRouter.post('/forgot-password', forgotPassword);

// Reset password route
authRouter.post('/reset-password', resetPassword);

export default authRouter;