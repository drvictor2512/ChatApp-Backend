import { hashData, verifyHashedData } from "../libs/hashData.js";
import User from "../models/User.js";
import { createToken } from './../libs/createToken.js';
import { verifyOTPInternal } from './otpController.js';
import { getUserByToken } from '../libs/verifyToken.js';
import { sendEmail } from "../libs/nodeMailer.js";
import OTP from "../models/OTP.js";
import { generateOTP } from "../util/generateOTP.js";

// Đăng ký
export const signUp = async (req, res) => {
    try {
        const { email, password, name, gender, dateOfBirth } = req.body;
        // Validate dữ liệu đầu vào
        if (!email || !password || !name) {
            throw new Error("Thiếu thông tin bắt buộc");
        } else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
            throw new Error("Email không hợp lệ");
        } else if (password.length < 8) {
            throw new Error("Mật khẩu phải có ít nhất 8 ký tự");
        }
        // Kiểm tra xem email đã tồn tại chưa
        const existingUser = await User.findOne({ email })
        if (existingUser) {
            throw new Error("Email đã được sử dụng");
        }
        // Băm mật khẩu
        const hashedPassword = await hashData(password);
        // Kiểm tra giới tính hợp lệ
        const allowedGenders = ['Nam', 'Nữ']
        if (typeof gender !== 'undefined' && !allowedGenders.includes(gender)) {
            throw new Error('Giới tính không hợp lệ')
        }

        // Kiểm tra và đặt ngày sinh hợp lệ
        let dob = undefined
        if (dateOfBirth) {
            const d = new Date(dateOfBirth)
            if (Number.isNaN(d.getTime())) throw new Error('Ngày sinh không hợp lệ')
            dob = d
        }
        // Tạo người dùng mới
        const newUser = new User({ email, password: hashedPassword, name, gender, ...(dob ? { dateOfBirth: dob } : {}), verified: false });
        await newUser.save();
        res.status(201).json({ message: "Đăng ký thành công, vui lòng xác thực OTP" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Xác thực OTP sau đăng ký
export const verifySignUpOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            throw new Error('Thiếu thông tin bắt buộc');
        }
        await verifyOTPInternal(email, otp);
        res.status(200).json({ message: 'Xác thực tài khoản thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}
// Đăng nhập
export const signIn = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validate dữ liệu đầu vào
        if (!email || !password) {
            throw new Error("Thiếu thông tin bắt buộc");
        }
        // Tìm người dùng theo email
        const fetchUser = await User.findOne({ email })
        if (!fetchUser) {
            throw new Error("Người dùng không tồn tại");
        }
        // Kiểm tra mật khẩu
        const hashPassword = fetchUser.password;
        const isPasswordValid = await verifyHashedData(password, hashPassword);
        if (!isPasswordValid) {
            throw new Error("Mật khẩu không đúng");
        }
        // Kiểm tra tài khoản đã xác thực chưa
        if (!fetchUser.verified) {
            throw new Error("Tài khoản chưa được xác thực. Vui lòng xác thực OTP trước khi đăng nhập");
        }
        // Tạo token và trả về thông tin người dùng cùng token
        const tokenData = { userId: fetchUser._id, email };
        const token = await createToken(tokenData)
        res.status(200).json({ message: "Đăng nhập thành công", fetchUser, token });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Đổi mật khẩu
export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

        if (!token) {
            throw new Error('Token không tồn tại trong header Authorization');
        }

        const user = await getUserByToken(token);

        const isPasswordValid = await verifyHashedData(oldPassword, user.password);
        if (!isPasswordValid) {
            throw new Error('Mật khẩu cũ không đúng');
        }

        if (newPassword.length < 8) {
            throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự');
        }

        // Kiểm tra mật khẩu mới không trùng với mật khẩu cũ
        if (await verifyHashedData(newPassword, user.password)) {
            throw new Error('Mật khẩu mới không được trùng với mật khẩu cũ');
        }

        user.password = await hashData(newPassword);
        await user.save();

        res.status(200).json({ message: 'Đổi mật khẩu thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Quên mật khẩu
export const forgotPassword = async (req, res) => {
    try {
        const {
            email,
            subject = 'Reset mật khẩu',
            message = 'Sử dụng OTP này để đặt lại mật khẩu của bạn:',
            duration = 1
        } = req.body;
        if (!email) {
            throw new Error('Email là bắt buộc');
        }
        const user = await User.findOne({ email });
        if (!user) {
            throw new Error('Người dùng không tồn tại');
        }
        // Xóa OTP cũ nếu có
        await OTP.deleteOne({ email })

        // Tạo mã OTP mới
        const generatedOTP = await generateOTP()
        const mailOption = {
            from: process.env.RESEND_DOMAIN,
            to: email,
            subject,
            html: `<p>${message}</p><p style="color:tomato; font-size:25px; letter-spacing: 2px;"><b>${generatedOTP}</b></p><p>Mã OTP này sẽ hết hạn trong ${duration} giờ.</p>`
        }
        await sendEmail(mailOption);
        const hashedOTP = await hashData(generatedOTP);
        const newOTP = new OTP({
            email,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + duration * 15 * 60 * 1000 // 15 phút
        })
        const createdOTP = await newOTP.save();
        res.status(200).json({ message: 'OTP đã được gửi đến email của bạn' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
// Đặt lại mật khẩu bằng OTP
export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            throw new Error('Thiếu thông tin bắt buộc');
        }
        const validOTP = await verifyOTPInternal(email, otp);
        if (!validOTP) {
            throw new Error('OTP không hợp lệ hoặc đã hết hạn');
        }
        if (newPassword.length < 8) {
            throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự');
        }
        const hashPassword = await hashData(newPassword);
        await User.updateOne({ email }, { password: hashPassword });
        await OTP.deleteOne({ email });
        res.status(200).json({ message: 'Đặt lại mật khẩu thành công' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}