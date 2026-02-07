import bcrypt from 'bcrypt';
export const hashData = async (data, saltRounds = 10) => {
    try {
        const hashedData = await bcrypt.hash(data, saltRounds);
        return hashedData;
    } catch (error) {
        throw new Error("Lỗi khi băm dữ liệu");
    }
}
export const verifyHashedData = async (data, hashedData) => {
    try {
        const match = await bcrypt.compare(data, hashedData);
        return match;
    } catch (error) {
        throw new Error("Lỗi khi xác minh dữ liệu đã băm");
    }
}
