import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

// Import DB and Middleware configuration
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
import autoTradeRoutes from './routes/autoTrade.routes.js'; 

// Import Jobs & Services
import { updateSymbolsDatabase } from './services/symbolUpdater.js';
import { updateCryptoSymbols } from './services/cryptoSymbolUpdater.js';
import { startPortfolioMatcher } from './jobs/portfolioMatcher.js';
import { startDerivUpdater } from './jobs/derivUpdater.js';
import { startCronJobs } from './jobs/newsCron.js';
import { startAutoDuckScheduler } from './services/autoTradeEngine.js';

const app = express();
const PORT = 3001;

app.set('trust proxy', 1);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

connectDB();
setupMiddlewares(app);
app.use(express.json());

// ─── Prefixed routes (chuẩn) ────────────────────────────────────────────────
app.use('/api/crypto',       cryptoRoutes);
app.use('/api/auth',         authRoutes);
app.use('/api/portfolio',    portfolioRoutes);
app.use('/api/derivatives',  derivativesRoutes);
app.use('/api/market',       marketRoutes);
app.use('/api/ai',           aiRoutes);
app.use('/api/history',      historyRoutes);
app.use('/api/auto-trade', autoTradeRoutes);

// ─── Flat alias routes  ────────────────────────

// Market aliases
app.use('/api/symbols',        (req, res, next) => { req.url = '/symbols';          marketRoutes(req, res, next); });
app.use('/api/market-heatmap', (req, res, next) => { req.url = '/heatmap';          marketRoutes(req, res, next); });
app.use('/api/market-radar',   (req, res, next) => { req.url = '/radar';            marketRoutes(req, res, next); });
app.use('/api/info',           (req, res, next) => { req.url = '/info' + req.path;  marketRoutes(req, res, next); });

// AI aliases
app.use('/api/user-history',       (req, res, next) => { req.url = '/user-history' + req.path;    aiRoutes(req, res, next); });
app.use('/api/analyze',            (req, res, next) => { req.url = '/analyze' + req.path;         aiRoutes(req, res, next); });
app.use('/api/ai-news',            (req, res, next) => { req.url = '/ai-news' + req.path;         aiRoutes(req, res, next); });
app.use('/api/news',               (req, res, next) => { req.url = '/news' + req.path;             aiRoutes(req, res, next); });
app.use('/api/action-panel',       (req, res, next) => { req.url = '/action-panel' + req.path;    aiRoutes(req, res, next); });
app.use('/api/analyze-derivatives',(req, res, next) => { req.url = '/analyze-derivatives';        aiRoutes(req, res, next); });
app.use('/api/stock-chat',         (req, res, next) => { req.url = '/stock-chat' + req.path;      aiRoutes(req, res, next); }); 
app.use('/api/debug-feed',         (req, res, next) => { req.url = '/debug-feed' + req.path;      aiRoutes(req, res, next); });  

// Derivatives aliases
app.use('/api/deriv-radar',  (req, res, next) => { req.url = '/radar';  derivativesRoutes(req, res, next); });
app.use('/api/deriv-export', (req, res, next) => { req.url = '/export'; derivativesRoutes(req, res, next); });
app.use('/api/deriv-news',   (req, res, next) => {
    req.url = '/news' + req.path;
    derivativesRoutes(req, res, next);
});

// Crypto aliases
app.use('/api/crypto-symbols', (req, res, next) => { req.url = '/symbols'; cryptoRoutes(req, res, next); });

startPortfolioMatcher();
startDerivUpdater();

app.listen(PORT, async () => {
    console.log(chalk.bgGreen.black.italic(`\n OMNI DUCK SERVER MONGODB READY (local test: http://localhost:${PORT}) `));
    startAutoDuckScheduler();
    try {
        await updateSymbolsDatabase();
        await updateCryptoSymbols();
        startCronJobs();
    } catch (error) {
        console.error(chalk.red('[LỖI] Hệ thống gặp lỗi khi nạp dữ liệu ban đầu tại startup:'), error.message);
    }
});