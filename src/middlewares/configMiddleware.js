import cors from 'cors';
import rateLimit from 'express-rate-limit';

export const corsOptions = {
     origin: function (origin, callback) {
         if (!origin || origin === 'null') return callback(null, true);

         const allowedOrigins = [
            'https://your-frontend.example.com',
            'http://localhost:5173'
         ];
         const localOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
         // ngrok free uses both *.ngrok-free.dev and *.ngrok-free.app
         const ngrokOriginPattern = /^https?:\/\/[A-Za-z0-9-]+\.ngrok(-free)?\.(io|app|dev)(?::\d+)?$/;
         // Cloudflare Quick Tunnel / named tunnel hostnames when testing from Termux/PC
         const cloudflareOriginPattern = /^https?:\/\/[A-Za-z0-9.-]+\.(trycloudflare\.com|cfargotunnel\.com)(?::\d+)?$/;

         if (
             allowedOrigins.includes(origin) ||
             localOriginPattern.test(origin) ||
             ngrokOriginPattern.test(origin) ||
             cloudflareOriginPattern.test(origin)
         ) {
             callback(null, true);
         } else {
             // false = deny without throwing (throwing can drop CORS headers on preflight)
             callback(null, false);
         }
     },
    optionsSuccessStatus: 200,
    credentials: true,
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'ngrok-skip-browser-warning',
        'x-signal-secret',
        'Accept',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
    skip: (req) => req.method === 'OPTIONS',
});

export const setupMiddlewares = (app) => {
    // CORS trước rate-limit để preflight/OPTIONS luôn có Access-Control-* headers
    app.use(cors(corsOptions));
    app.use(limiter);
};
