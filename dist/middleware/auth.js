"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = header.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET ?? 'dev-secret');
        req.userId = payload.sub;
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
function optionalAuth(req, _res, next) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
        try {
            const payload = jsonwebtoken_1.default.verify(header.slice(7), process.env.JWT_SECRET ?? 'dev-secret');
            req.userId = payload.sub;
        }
        catch { /* ignore */ }
    }
    next();
}
