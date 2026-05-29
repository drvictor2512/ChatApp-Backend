import jwt from 'jsonwebtoken';

export const createToken = async (tokenData, tokenKey = process.env.TOKEN_KEY, expiresIn = process.env.TOKEN_EXPIRES_IN) => {
    try {
        const token = await jwt.sign(tokenData, tokenKey, { expiresIn: expiresIn });
        return token;
    } catch (error) {
        throw new Error("Lỗi tạo token");
    }
}