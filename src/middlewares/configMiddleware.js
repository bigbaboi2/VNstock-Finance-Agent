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
    // Dashboard polling nhiều endpoint + nhiều interval (20–30s) + reload khi dev
    // → 250/15p quá thấp, dễ tự trip 429 cho TOÀN BỘ app. Nâng lên mức an toàn cho
    // vài user nội bộ. Có thể siết lại nếu mở public.
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Quá nhiều request — vui lòng chờ ít phút.' },
});

export const setupMiddlewares = (app) => {
    app.use(limiter);
    app.use(cors(corsOptions));
};