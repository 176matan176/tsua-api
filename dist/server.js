"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const redis_1 = require("./lib/redis");
const socket_1 = require("./socket");
const auth_1 = __importDefault(require("./routes/auth"));
const posts_1 = __importDefault(require("./routes/posts"));
const stocks_1 = __importDefault(require("./routes/stocks"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const rooms_1 = __importDefault(require("./routes/rooms"));
const news_1 = __importDefault(require("./routes/news"));
const users_1 = __importDefault(require("./routes/users"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Middleware
app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
const ALLOWED_ORIGINS = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'https://tsua-rho.vercel.app',
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
            cb(null, true);
        }
        else {
            cb(new Error(`CORS: ${origin} not allowed`));
        }
    },
    credentials: true,
}));
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: '1mb' }));
// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
// API routes
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/posts', posts_1.default);
app.use('/api/v1/stocks', stocks_1.default);
app.use('/api/v1/alerts', alerts_1.default);
app.use('/api/v1/rooms', rooms_1.default);
app.use('/api/v1/news', news_1.default);
app.use('/api/v1/users', users_1.default);
// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
const PORT = parseInt(process.env.PORT ?? '3001');
async function main() {
    // Connect Redis
    await (0, redis_1.connectRedis)();
    // Init Socket.io
    (0, socket_1.initSocket)(httpServer);
    // Start price poller only when Redis is available
    if ((0, redis_1.isRedisAvailable)() && process.env.NODE_ENV !== 'test') {
        const { startPricePoller } = await Promise.resolve().then(() => __importStar(require('./jobs/pricePoller')));
        startPricePoller();
    }
    httpServer.listen(PORT, () => {
        console.log(`\n🚀 Tsua API running on http://localhost:${PORT}`);
        console.log(`📡 WebSocket ready`);
        console.log(`🇮🇱 Shuk closed? TASE polling paused automatically\n`);
    });
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
