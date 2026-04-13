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
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisSub = exports.redisPub = exports.redis = void 0;
exports.connectRedis = connectRedis;
exports.isRedisAvailable = isRedisAvailable;
exports.cacheGet = cacheGet;
exports.cacheSet = cacheSet;
// Redis is optional for development — gracefully degrades without it
const stub = {
    get: async (_key) => null,
    set: async () => 'OK',
    publish: async () => 0,
    subscribe: (_channel, _cb) => Promise.resolve(),
    connect: async () => { },
};
exports.redis = stub;
exports.redisPub = stub;
exports.redisSub = stub;
let redisAvailable = false;
async function connectRedis() {
    try {
        const { createClient } = await Promise.resolve().then(() => __importStar(require('redis')));
        const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
        exports.redis = createClient({ url });
        exports.redisPub = createClient({ url });
        exports.redisSub = createClient({ url });
        await Promise.all([
            exports.redis.connect(),
            exports.redisPub.connect(),
            exports.redisSub.connect(),
        ]);
        redisAvailable = true;
        console.log('[Redis] Connected');
    }
    catch {
        console.log('[Redis] Not available — running without cache/pub-sub (dev mode)');
        exports.redis = stub;
        exports.redisPub = stub;
        exports.redisSub = stub;
    }
}
function isRedisAvailable() {
    return redisAvailable;
}
async function cacheGet(key) {
    try {
        const raw = await exports.redis.get(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
async function cacheSet(key, value, _ttlSeconds = 30) {
    try {
        await exports.redis.set(key, JSON.stringify(value));
    }
    catch { /* ignore */ }
}
