import { sendEmail } from '../libs/nodeMailer.js';
import OTP from '../models/OTP.js';
import { generateOTP } from '../util/generateOTP.js';
import { hashData, verifyHashedData } from '../libs/hashData.js';
import User from '../models/User.js';

export const sendVerificationOTPEmail = async (req, res) => {
    try {
        const {
            email,
            subject = 'Mã xác thực từ ChatApp',
            message = 'Vui lòng sử dụng mã OTP dưới đây để xác thực tài khoản của bạn:',
            duration = 1
        } = req.body;
        if (!email) {
            throw new Error("Thiếu thông tin bắt buộc: email")
        }
        const existingUser = await User.findOne({ email });
        if (!existingUser) {
            throw new Error("Email không tồn tại trong hệ thống")
        }
        // Xóa OTP cũ nếu có
        await OTP.deleteOne({ email })

        // Tạo mã OTP mới
        const generatedOTP = await generateOTP()

        // send email
        const mailOptions = {
            from: process.env.AUTH_EMAIL,
            to: email,
            subject,
            html: `<p>${message}</p><p style="color:tomato; font-size:25px; letter-spacing: 2px;"><b>${generatedOTP}</b></p><p>Mã OTP này sẽ hết hạn trong ${duration} giờ.</p>`
        }
        await sendEmail(mailOptions);
        // Lưu OTP vào database
        const hashedOTP = await hashData(generatedOTP);
        const newOTP = new OTP({
            email,
            otp: hashedOTP,
            createdAt: Date.now(),
            expiresAt: Date.now() + duration * 15 * 60 * 1000 // 15 phút
        })
        const createdOTP = await newOTP.save();
        res.status(200).json({ success: true, message: "Gửi mã OTP thành công", createdOTP });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }

}

export const verifyOTPInternal = async (email, otp) => {
    if (!(email && otp)) {
        throw new Error("Thiếu thông tin bắt buộc")
    }
    const existingOTP = await OTP.findOne({ email })
    if (!existingOTP) {
        throw new Error("OTP không tồn tại")
    }
    if (existingOTP.expiresAt < Date.now()) {
        await OTP.deleteOne({ email })
        throw new Error("OTP đã hết hạn")
    }
    const validOTP = await verifyHashedData(otp, existingOTP.otp);
    if (!validOTP) {
        throw new Error("OTP không hợp lệ")
    }
    await User.updateOne({ email }, { $set: { verified: true } })
    await OTP.deleteOne({ email })
    return true;
}
