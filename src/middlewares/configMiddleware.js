import cors from 'cors';
import rateLimit from 'express-rate-limit';

export const corsOptions = {
     origin: function (origin, callback) {
         if (!origin) return callback(null, true);

         const allowedOrigins = [
            'https://your-frontend.example.com',
            'http://localhost:5173'
        ];

         if (allowedOrigins.includes(origin) || origin.includes('ngrok-free.app') || origin.includes('ngrok.app') || origin.includes('ngrok.io')) {
            callback(null, true);
        } else {
            callback(new Error('Bị chặn bởi CORS policy: Domain không hợp lệ.'));
        }
    },
    optionsSuccessStatus: 200,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-signal-secret']
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