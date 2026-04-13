import axios from 'axios';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

// yahoo-finance2 is ESM-only, so we use dynamic import in CJS context
let _yf: any = null;
async function getYF() {
  if (!_yf) {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – yahoo-finance2 is ESM-only
      const mod = await import('yahoo-finance2');
      _yf = mod.default ?? mod;
      try { _yf.setGlobalConfig({ validation: { logErrors: false } }); } catch {}
    } catch {
      _yf = null;
    }
  }
  return _yf;
}

export interface StockQuote {
  ticker: string;
  nameEn: string;
  nameHe?: string;
  exchange: 'TASE' | 'NASDAQ' | 'NYSE' | 'AMEX';
  currency: 'USD' | 'ILS';
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  updatedAt: string;
}

export interface OHLCVBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Finnhub REST quote — primary source (no ESM issues)
async function fetchQuoteFinnhub(ticker: string): Promise<Partial<StockQuote> | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const [quoteRes, profileRes] = await Promise.allSettled([
      axios.get(`${FINNHUB_BASE}/quote`, { params: { symbol: ticker, token: FINNHUB_KEY }, timeout: 5000 }),
      axios.get(`${FINNHUB_BASE}/stock/profile2`, { params: { symbol: ticker, token: FINNHUB_KEY }, timeout: 5000 }),
    ]);
    const q = quoteRes.status === 'fulfilled' ? quoteRes.value.data : null;
    const p = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
    if (!q || !q.c || q.c === 0) return null;
    const prevClose = q.pc ?? q.c;
    const change = q.d ?? (q.c - prevClose);
    const changePercent = q.dp ?? (prevClose ? (change / prevClose) * 100 : 0);
    return {
      ticker,
      nameEn: p?.name ?? ticker,
      exchange: mapExchange(p?.exchange ?? ''),
      currency: (p?.currency as 'USD' | 'ILS') ?? 'USD',
      price: q.c,
      change,
      changePercent,
      volume: q.v ?? 0,
      marketCap: p?.marketCapitalization ? p.marketCapitalization * 1e6 : undefined,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Finnhub] Failed to fetch ${ticker}:`, (err as Error).message);
    return null;
  }
}

export async function fetchQuote(ticker: string): Promise<Partial<StockQuote> | null> {
  // Try Finnhub first (reliable REST API, no ESM issues)
  const finnhubResult = await fetchQuoteFinnhub(ticker);
  if (finnhubResult) return finnhubResult;

  // Fallback to Yahoo Finance (ESM dynamic import)
  try {
    const yf = await getYF();
    if (!yf) return null;
    const result = await yf.quote(ticker);
    return {
      ticker,
      nameEn: result.longName ?? result.shortName ?? ticker,
      exchange: mapExchange(result.exchange ?? ''),
      currency: (result.currency as 'USD' | 'ILS') ?? 'USD',
      price: result.regularMarketPrice ?? 0,
      change: result.regularMarketChange ?? 0,
      changePercent: result.regularMarketChangePercent ?? 0,
      volume: result.regularMarketVolume ?? 0,
      marketCap: result.marketCap,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Yahoo] Failed to fetch ${ticker}:`, (err as Error).message);
    return null;
  }
}

export async function fetchHistory(
  ticker: string,
  period1: string,
  interval: '1d' | '1wk' | '1mo' = '1d'
): Promise<OHLCVBar[]> {
  try {
    const yf = await getYF();
    const results = await yf.historical(ticker, { period1, interval });
    return results.map((r: any) => ({
      time: Math.floor(new Date(r.date).getTime() / 1000),
      open: r.open ?? 0,
      high: r.high ?? 0,
      low: r.low ?? 0,
      close: r.close ?? 0,
      volume: r.volume ?? 0,
    }));
  } catch (err) {
    console.error(`[Yahoo] History failed for ${ticker}:`, (err as Error).message);
    return [];
  }
}

export async function searchStocks(query: string) {
  try {
    const yf = await getYF();
    const results = await yf.search(query);
    return (results.quotes ?? [])
      .filter((q: any) => q.quoteType === 'EQUITY')
      .slice(0, 10)
      .map((q: any) => ({
        ticker: q.symbol,
        nameEn: q.longname ?? q.shortname ?? q.symbol,
        exchange: mapExchange(q.exchange ?? ''),
      }));
  } catch {
    return [];
  }
}

function mapExchange(raw: string): 'TASE' | 'NASDAQ' | 'NYSE' | 'AMEX' {
  if (raw === 'TLV') return 'TASE';
  if (raw === 'NMS' || raw === 'NGM' || raw === 'NCM') return 'NASDAQ';
  if (raw === 'NYQ') return 'NYSE';
  return 'NASDAQ';
}
