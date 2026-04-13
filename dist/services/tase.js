"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTaseOpen = isTaseOpen;
exports.fetchTaseQuote = fetchTaseQuote;
const axios_1 = __importDefault(require("axios"));
const TASE_BASE = 'https://api.tase.co.il/api';
// TASE market hours (IST, Sun-Thu)
function isTaseOpen() {
    const now = new Date();
    const istOffset = 3 * 60; // UTC+3 (Israel Standard Time)
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset) % (24 * 60);
    const dayOfWeek = now.getUTCDay(); // 0=Sun...6=Sat
    // TASE trades Sunday(0) through Thursday(4), 10:00-17:30 IST
    const isWeekday = dayOfWeek >= 0 && dayOfWeek <= 4;
    const inHours = istMinutes >= 10 * 60 && istMinutes < 17 * 60 + 30;
    return isWeekday && inHours;
}
async function fetchTaseQuote(ticker) {
    // ticker format: "TEVA.TA" -> use Yahoo Finance .TA suffix as primary
    // TASE API for additional data
    try {
        const symbol = ticker.replace('.TA', '');
        const url = `${TASE_BASE}/security/securities?symbol=${encodeURIComponent(symbol)}`;
        const { data } = await axios_1.default.get(url, { timeout: 5000 });
        if (!data?.securities?.length)
            return null;
        const s = data.securities[0];
        return {
            ticker,
            nameEn: s.nameEn ?? s.name,
            nameHe: s.nameHe ?? s.name,
            exchange: 'TASE',
            currency: 'ILS',
            price: parseFloat(s.lastPrice ?? '0'),
            change: parseFloat(s.change ?? '0'),
            changePercent: parseFloat(s.changePercent ?? '0'),
            volume: parseInt(s.volume ?? '0'),
            updatedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        // Fallback: use Yahoo Finance for .TA stocks
        return null;
    }
}
