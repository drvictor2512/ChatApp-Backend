import { hashData, verifyHashedData } from "../libs/hashData.js";
import User from "../models/User.js";
import { createToken } from './../libs/createToken.js';
import { verifyOTPInternal } from './otpController.js';
import { signoutByToken } from '../util/signoutHelper.js';
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
        const newUser = new User({ email, password: hashedPassword, name, gender, ...(dob ? { dateOfBirth: dob } : {}) });
        await newUser.save();
        res.status(201).json({ message: "Đăng ký thành công" });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}
// Đăng nhập
export const signIn = async (req, res) => {
    try {
        const { email, password, otp } = req.body;
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
        // Kiểm tra xác thực OTP nếu người dùng chưa được xác thực
        if (!fetchUser.verified) {
            if (!otp) {
                return res.status(401).json({ message: "OTP required", otpRequired: true });
            }

            // Verify provided OTP using shared helper
            await verifyOTPInternal(email, otp);
            fetchUser.verified = true;
        }

        // Tạo và gán token
        const tokenData = { userId: fetchUser._id, email };
        const token = await createToken(tokenData)
        fetchUser.token = token;
        await fetchUser.save();
        res.status(200).json({ message: "Đăng nhập thành công", fetchUser, token });

    } catch (error) {

        res.status(400).json({ message: error.message });
    }
}

// Đăng xuất (set verified = false và xóa token)
export const signOut = async (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
            throw new Error('Token không tồn tại trong header Authorization');
        }
        const result = await signoutByToken(token)
        if (!result) throw new Error('Người dùng không tìm thấy hoặc token không hợp lệ')
        res.status(200).json({ message: 'Đăng xuất thành công', user: result });
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

        const user = await User.findOne({ token });
        if (!user) {
            throw new Error('Người dùng không tồn tại hoặc token không hợp lệ');
        }

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
            from: process.env.AUTH_EMAIL,
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