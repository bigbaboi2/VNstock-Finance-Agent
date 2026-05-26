import mongoose from 'mongoose';
import chalk from 'chalk';

export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(chalk.bgGreen.black.bold(' ✔ KẾT NỐI MONGODB THÀNH CÔNG BẰNG LINK BYPASS '));
    } catch (error) {
        console.error(chalk.red('❌ Lỗi kết nối MongoDB:'), error.message);
        process.exit(1);  
    }
};