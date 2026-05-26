import mongoose from 'mongoose';
import chalk from 'chalk';

export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(chalk.green.italic('[HỆ THỐNG] KẾT NỐI MONGODB THÀNH CÔNG '));
    } catch (error) {
        console.error(chalk.red('[HỆ THỐNG] Lỗi kết nối MongoDB:'), error.message);
        process.exit(1);  
    }
};