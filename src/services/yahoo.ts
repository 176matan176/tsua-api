// yahoo-finance2 is ESM-only, so we use dynamic import in CJS context
let _yf: any = null;
async function getYF() {
  if (!_yf) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – yahoo-finance2 is ESM-only; types require node16 resolution
    const mod = await import('yahoo-finance2');
    _yf = mod.default;
    try { _yf.setGlobalConfig({ validation: { logErrors: false } }); } catch {}
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

export async function fetchQuote(ticker: string): Promise<Partial<StockQuote> | null> {
  try {
    const yf = await getYF();
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
