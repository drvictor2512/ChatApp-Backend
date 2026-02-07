import nodemailer from 'nodemailer';

const AUTH_EMAIL = process.env.AUTH_EMAIL;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: 465,
    secure: true,
    auth: {
        user: AUTH_EMAIL,
        pass: AUTH_PASSWORD,
    },
});

transporter.verify((error, success) => {
    if (error) {
        console.log('Lỗi kết nối với dịch vụ email: ', error);
    } else {
        console.log('Kết nối với dịch vụ email thành công');
        console.log(success);
    }
});

export const sendEmail = async (mailOptions) => {
    try {
        await transporter.sendMail(mailOptions);
        return;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Không thể gửi email');
    }
}