import mongoose from "mongoose";
export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: "ChatAppDB" });
        console.log("Kết nối thành công đến cơ sở dữ liệu MongoDB");
    } catch (error) {
        console.error("Lỗi kết nối đến cơ sở dữ liệu MongoDB:", error);
        process.exit(1);
    }
}