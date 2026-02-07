export const generateOTP = () => {
    try {
        const otp = `${Math.floor(10000 + Math.random() * 90000)}`;
        return otp;
    } catch (error) {
        throw new Error("Lỗi khi tạo OTP");
    }
}