import { prisma } from '../lib/prisma.js';

// Hebrew stock name aliases → ticker symbols
const HEBREW_CASHTAG_ALIASES: Record<string, string> = {
  'לאומי': 'LUMI.TA', 'פועלים': 'POLI.TA', 'הפועלים': 'POLI.TA',
  'מזרחי': 'MZTF.TA', 'דיסקונט': 'DSCT.TA',
  'טבע': 'TEVA.TA', 'נייס': 'NICE.TA',
  'אלביט': 'ESLT.TA', 'נובה': 'NVMI.TA', 'קמטק': 'CAMT.TA',
  'בזק': 'BEZQ.TA', 'כימיקלים': 'ICL.TA', "כי\"ל": 'ICL.TA',
  'מיגדל': 'MGDL.TA', 'הראל': 'HARL.TA', 'אמות': 'AMOT.TA',
  'אפל': 'AAPL', 'טסלה': 'TSLA', 'אנבידיה': 'NVDA',
  'מיקרוסופט': 'MSFT', 'אמזון': 'AMZN', 'מטא': 'META', 'גוגל': 'GOOGL',
};

export function extractCashtags(body: string): string[] {
  const regex = /\$([A-Za-z][A-Za-z0-9.]*|[\u05D0-\u05EA][\u05D0-\u05EA]*)/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(body)) !== null) {
    const raw = match[1].trim();
    const normalized = HEBREW_CASHTAG_ALIASES[raw] ?? raw.toUpperCase();
    if (!matches.includes(normalized)) matches.push(normalized);
  }
  return matches;
}

export async function resolveStockMentions(tickers: string[]) {
  if (!tickers.length) return [];
  return prisma.stock.findMany({
    where: { ticker: { in: tickers }, isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameHe: true, exchange: true },
  });
}
