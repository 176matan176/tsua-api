import { Queue, Worker } from 'bullmq';
import { redis, cacheSet, cacheGet } from '../lib/redis';
import { redisPub } from '../lib/redis';
import { fetchQuote } from '../services/yahoo';
import { fetchTaseQuote, isTaseOpen } from '../services/tase';
import { prisma } from '../lib/prisma';
const POPULAR_US_TICKERS = ['AAPL','NVDA','TSLA','MSFT','AMZN','GOOGL','META','AMD','INTC','TEVA','NICE','CHKP','CYBR','WIX','MNDY'];
const TA35_TICKERS = ['TEVA.TA','NICE.TA','CHKP.TA','ESLT.TA','LUMI.TA','MZTF.TA','POLI.TA','BEZQ.TA','ICL.TA','NVMI.TA','CAMT.TA'];

const POLL_INTERVAL_MS = 15_000;

export const priceQueue = new Queue('price-polling', {
  connection: redis,
  defaultJobOptions: { removeOnComplete: 10, removeOnFail: 20 },
});

export function startPricePoller() {
  // Schedule recurring price poll
  setInterval(async () => {
    await priceQueue.add('poll', {}, { jobId: 'price-poll-' + Date.now() });
  }, POLL_INTERVAL_MS);

  const worker = new Worker(
    'price-polling',
    async () => {
      const tickers = [...POPULAR_US_TICKERS];

      // Add TASE tickers only during market hours
      if (isTaseOpen()) {
        tickers.push(...TA35_TICKERS);
      }

      // Fetch in parallel batches of 10
      const batches = chunk(tickers, 10);
      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(async (ticker) => {
            try {
              // Try TASE API first for .TA stocks, fallback to Yahoo
              const quote = ticker.endsWith('.TA')
                ? (await fetchTaseQuote(ticker)) ?? (await fetchQuote(ticker))
                : await fetchQuote(ticker);

              if (!quote) return;

              // Cache price
              await cacheSet(`price:${ticker}`, quote, 60);

              // Publish to Socket.io listeners
              await redisPub.publish(`prices`, JSON.stringify({ ticker, quote }));

              // Check alerts
              await checkAlerts(ticker, quote.price ?? 0, quote.volume ?? 0);
            } catch (err) {
              // Silently skip failed tickers
            }
          })
        );
      }
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error('[PricePoller] Job failed:', err.message);
  });

  console.log('[PricePoller] Started');
}

async function checkAlerts(ticker: string, price: number, volume: number) {
  try {
    const stock = await prisma.stock.findUnique({ where: { ticker } });
    if (!stock) return;

    const alerts = await prisma.alert.findMany({
      where: { stockId: stock.id, isActive: true },
    });

    for (const alert of alerts) {
      let triggered = false;

      if (alert.alertType === 'price_above' && alert.threshold && price >= Number(alert.threshold)) {
        triggered = true;
      } else if (alert.alertType === 'price_below' && alert.threshold && price <= Number(alert.threshold)) {
        triggered = true;
      }

      if (triggered) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: { isActive: false, triggeredAt: new Date() },
        });

        // Publish alert notification
        await redisPub.publish(`alert:${alert.userId}`, JSON.stringify({
          alertId: alert.id,
          ticker,
          alertType: alert.alertType,
          price,
          threshold: alert.threshold,
        }));
      }
    }
  } catch { /* skip */ }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
