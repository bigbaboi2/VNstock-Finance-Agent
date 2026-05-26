import cors from 'cors';
import rateLimit from 'express-rate-limit';

export const corsOptions = {
    origin: ['https://your-frontend.example.com', 'http://localhost:5173'],
    optionsSuccessStatus: 200,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

export const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 250, 
    message: 'Wait some minutes, server crashing!'
});

export const setupMiddlewares = (app) => {
    app.use(limiter);
    app.use(cors(corsOptions));
};