import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// Import   DB and Middleware configuration

import { connectDB } from './config/db.js';
import { setupMiddlewares } from './middlewares/configMiddleware.js';

// Import routing system 

import authRoutes from './routes/auth.routes.js';
import portfolioRoutes from './routes/portfolio.routes.js';
import derivativesRoutes from './routes/derivatives.routes.js';
import marketRoutes from './routes/market.routes.js';
import aiRoutes from './routes/ai.routes.js';
import historyRoutes from './routes/history.routes.js';
import cryptoRoutes from './routes/crypto.routes.js';

// Import  (Jobs & Services)

import { startCryptoUpdater } from './jobs/cryptoUpdater.js';
import { updateSymbolsDatabase } from './services/symbolUpdater.js';
import { updateCryptoSymbols } from './services/cryptoSymbolUpdater.js';
import { startPortfolioMatcher } from './jobs/portfolioMatcher.js';
import { startDerivUpdater } from './jobs/derivUpdater.js';
import { startCronJobs } from './jobs/newsCron.js';

// Initialize the application

const app = express();
const PORT = 3001;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

connectDB();

setupMiddlewares(app);
app.use(express.json());

app.use('/api/crypto', cryptoRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/derivatives', derivativesRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/history', historyRoutes);

startPortfolioMatcher();
startDerivUpdater();

app.listen(PORT, async () => {
    console.log(chalk.bgGreen.black.italic(`\n OMNI DUCK SERVER MONGODB READY (local test: http://localhost:${PORT}) `));
    
    try {

        await updateSymbolsDatabase();     
        await updateCryptoSymbols();   
        startCryptoUpdater();
        startCronJobs();    
    } catch (error) {
        console.error(chalk.red('[LỖI] Hệ thống gặp lỗi khi nạp dữ liệu ban đầu tại startup:'), error.message);
    }
});