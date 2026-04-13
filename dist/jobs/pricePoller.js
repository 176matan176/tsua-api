"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceQueue = void 0;
exports.startPricePoller = startPricePoller;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
const redis_2 = require("../lib/redis");
const yahoo_1 = require("../services/yahoo");
const tase_1 = require("../services/tase");
const prisma_1 = require("../lib/prisma");
const POPULAR_US_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'INTC', 'TEVA', 'NICE', 'CHKP', 'CYBR', 'WIX', 'MNDY'];
const TA35_TICKERS = ['TEVA.TA', 'NICE.TA', 'CHKP.TA', 'ESLT.TA', 'LUMI.TA', 'MZTF.TA', 'POLI.TA', 'BEZQ.TA', 'ICL.TA', 'NVMI.TA', 'CAMT.TA'];
const POLL_INTERVAL_MS = 15000;
exports.priceQueue = new bullmq_1.Queue('price-polling', {
    connection: redis_1.redis,
    defaultJobOptions: { removeOnComplete: 10, removeOnFail: 20 },
});
function startPricePoller() {
    // Schedule recurring price poll
    setInterval(async () => {
        await exports.priceQueue.add('poll', {}, { jobId: 'price-poll-' + Date.now() });
    }, POLL_INTERVAL_MS);
    const worker = new bullmq_1.Worker('price-polling', async () => {
        const tickers = [...POPULAR_US_TICKERS];
        // Add TASE tickers only during market hours
        if ((0, tase_1.isTaseOpen)()) {
            tickers.push(...TA35_TICKERS);
        }
        // Fetch in parallel batches of 10
        const batches = chunk(tickers, 10);
        for (const batch of batches) {
            await Promise.allSettled(batch.map(async (ticker) => {
                try {
                    // Try TASE API first for .TA stocks, fallback to Yahoo
                    const quote = ticker.endsWith('.TA')
                        ? (await (0, tase_1.fetchTaseQuote)(ticker)) ?? (await (0, yahoo_1.fetchQuote)(ticker))
                        : await (0, yahoo_1.fetchQuote)(ticker);
                    if (!quote)
                        return;
                    // Cache price
                    await (0, redis_1.cacheSet)(`price:${ticker}`, quote, 60);
                    // Publish to Socket.io listeners
                    await redis_2.redisPub.publish(`prices`, JSON.stringify({ ticker, quote }));
                    // Check alerts
                    await checkAlerts(ticker, quote.price ?? 0, quote.volume ?? 0);
                }
                catch (err) {
                    // Silently skip failed tickers
                }
            }));
        }
    }, { connection: redis_1.redis, concurrency: 1 });
    worker.on('failed', (job, err) => {
        console.error('[PricePoller] Job failed:', err.message);
    });
    console.log('[PricePoller] Started');
}
async function checkAlerts(ticker, price, volume) {
    try {
        const stock = await prisma_1.prisma.stock.findUnique({ where: { ticker } });
        if (!stock)
            return;
        const alerts = await prisma_1.prisma.alert.findMany({
            where: { stockId: stock.id, isActive: true },
        });
        for (const alert of alerts) {
            let triggered = false;
            if (alert.alertType === 'price_above' && alert.threshold && price >= Number(alert.threshold)) {
                triggered = true;
            }
            else if (alert.alertType === 'price_below' && alert.threshold && price <= Number(alert.threshold)) {
                triggered = true;
            }
            if (triggered) {
                await prisma_1.prisma.alert.update({
                    where: { id: alert.id },
                    data: { isActive: false, triggeredAt: new Date() },
                });
                // Publish alert notification
                await redis_2.redisPub.publish(`alert:${alert.userId}`, JSON.stringify({
                    alertId: alert.id,
                    ticker,
                    alertType: alert.alertType,
                    price,
                    threshold: alert.threshold,
                }));
            }
        }
    }
    catch { /* skip */ }
}
function chunk(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}
