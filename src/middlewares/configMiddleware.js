import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

export const corsOptions = {
     origin: function (origin, callback) {
         if (!origin || origin === 'null') return callback(null, true);

         const envOrigins = [
            process.env.FRONTEND_URL,
            process.env.WEB_APP_URL,
            process.env.VITE_APP_URL,
            process.env.APP_URL,
         ]
            .filter(Boolean)
            .map((u) => String(u).replace(/\/+$/, ''));

         const allowedOrigins = [
            ...envOrigins,
            'http://localhost:5173',
         ];
         const localOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
         // ngrok free uses both *.ngrok-free.dev and *.ngrok-free.app
         const ngrokOriginPattern = /^https?:\/\/[A-Za-z0-9-]+\.ngrok(-free)?\.(io|app|dev)(?::\d+)?$/;
         // Cloudflare Quick Tunnel / named tunnel hostnames when testing from Termux/PC
         const cloudflareOriginPattern = /^https?:\/\/[A-Za-z0-9.-]+\.(trycloudflare\.com|cfargotunnel\.com)(?::\d+)?$/;
         const vercelOriginPattern = /^https?:\/\/[A-Za-z0-9.-]+\.vercel\.app(?::\d+)?$/;

         if (
             allowedOrigins.includes(origin) ||
             localOriginPattern.test(origin) ||
             ngrokOriginPattern.test(origin) ||
             cloudflareOriginPattern.test(origin) ||
             vercelOriginPattern.test(origin)
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
        'x-omni-language',
        'X-Omni-Language',
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
    // Body parsers — PHẢI đặt trước routes để req.body được parse
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // CORS trước rate-limit để preflight/OPTIONS luôn có Access-Control-* headers
    app.use(cors(corsOptions));
    app.use(limiter);
};

