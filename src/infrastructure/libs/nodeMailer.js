import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

if (!resend) {
    console.warn('RESEND_API_KEY is not set. Email sending will fail.');
}


export const sendEmail = async (mailOptions) => {
    const { from, to, subject, html, text } = mailOptions;
    if (!to) {
        throw new Error('Missing `to` in mailOptions');
    }
    try {
        const result = await resend.emails.send({
            from: from,
            to,
            subject,
            html,
            text,
        });
        console.log('Resend send response:', result);
        return result;
    } catch (error) {
        console.error('Error sending email via Resend:', error?.response || error);
        throw new Error('Không thể gửi email');
    }
};