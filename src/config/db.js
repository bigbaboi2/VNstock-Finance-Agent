import mongoose from 'mongoose';
import chalk from 'chalk';

export const connectDB = async () => {
    try {
        mongoose.connection.on('disconnected', () => {
            console.log(chalk.yellow('[SYSTEM] MongoDB disconnected; Mongoose will try to reconnect.'));
        });
        mongoose.connection.on('reconnected', () => {
            console.log(chalk.green('[SYSTEM] MongoDB reconnected successfully.'));
        });
        mongoose.connection.on('error', (error) => {
            console.error(chalk.red('[SYSTEM] MongoDB runtime error:'), error.message);
        });

        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
        });
        console.log(chalk.green.italic('[HỆ THỐNG] KẾT NỐI MONGODB THÀNH CÔNG '));
    } catch (error) {
        console.error(chalk.red('[HỆ THỐNG] Lỗi kết nối MongoDB:'), error.message);
        process.exit(1);  
    }
};
