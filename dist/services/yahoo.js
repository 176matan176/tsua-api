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
exports.fetchQuote = fetchQuote;
exports.fetchHistory = fetchHistory;
exports.searchStocks = searchStocks;
// yahoo-finance2 is ESM-only, so we use dynamic import in CJS context
let _yf = null;
async function getYF() {
    if (!_yf) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – yahoo-finance2 is ESM-only; types require node16 resolution
        const mod = await Promise.resolve().then(() => __importStar(require('yahoo-finance2')));
        _yf = mod.default;
        try {
            _yf.setGlobalConfig({ validation: { logErrors: false } });
        }
        catch { }
    }
    return _yf;
}
async function fetchQuote(ticker) {
    try {
        const yf = await getYF();
        const result = await yf.quote(ticker);
        return {
            ticker,
            nameEn: result.longName ?? result.shortName ?? ticker,
            exchange: mapExchange(result.exchange ?? ''),
            currency: result.currency ?? 'USD',
            price: result.regularMarketPrice ?? 0,
            change: result.regularMarketChange ?? 0,
            changePercent: result.regularMarketChangePercent ?? 0,
            volume: result.regularMarketVolume ?? 0,
            marketCap: result.marketCap,
            updatedAt: new Date().toISOString(),
        };
    }
    catch (err) {
        console.error(`[Yahoo] Failed to fetch ${ticker}:`, err.message);
        return null;
    }
}
async function fetchHistory(ticker, period1, interval = '1d') {
    try {
        const yf = await getYF();
        const results = await yf.historical(ticker, { period1, interval });
        return results.map((r) => ({
            time: Math.floor(new Date(r.date).getTime() / 1000),
            open: r.open ?? 0,
            high: r.high ?? 0,
            low: r.low ?? 0,
            close: r.close ?? 0,
            volume: r.volume ?? 0,
        }));
    }
    catch (err) {
        console.error(`[Yahoo] History failed for ${ticker}:`, err.message);
        return [];
    }
}
async function searchStocks(query) {
    try {
        const yf = await getYF();
        const results = await yf.search(query);
        return (results.quotes ?? [])
            .filter((q) => q.quoteType === 'EQUITY')
            .slice(0, 10)
            .map((q) => ({
            ticker: q.symbol,
            nameEn: q.longname ?? q.shortname ?? q.symbol,
            exchange: mapExchange(q.exchange ?? ''),
        }));
    }
    catch {
        return [];
    }
}
function mapExchange(raw) {
    if (raw === 'TLV')
        return 'TASE';
    if (raw === 'NMS' || raw === 'NGM' || raw === 'NCM')
        return 'NASDAQ';
    if (raw === 'NYQ')
        return 'NYSE';
    return 'NASDAQ';
}
