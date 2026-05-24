import axios from 'axios';
import { run, withTransaction } from '../db/client.js';

// ─── Market Data Service ─────────────────────────────────────────────────────
// Fetches real-time historical OHLCV candle data from Coinbase (public, no key).
// Used by the tickers route to power the frontend TradingChart component.

export interface CandleData {
  time:   number  // unix seconds
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

// Coinbase granularity map (seconds)
const GRANULARITY: Record<string, number> = {
  '1m': 60, '5m': 300, '15m': 900,
  '1h': 3600, '6h': 21600, '1d': 86400,
}

export class MarketService {
  /**
   * Fetch OHLCV candles from Coinbase public REST API.
   * No API key required for public historical data.
   */
  async getCandles(symbol: string, interval = '1h', limit = 200): Promise<CandleData[]> {
    const productId  = symbol.includes('-') ? symbol : `${symbol}-USD`
    const granularity = GRANULARITY[interval] ?? 3600

    try {
      const { data } = await axios.get<number[][]>(
        `https://api.exchange.coinbase.com/products/${productId}/candles`,
        {
          params: { granularity },
          headers: { 'User-Agent': 'DarkSideCrypto/1.0' },
          timeout: 8_000,
        }
      )

      // Coinbase returns: [timestamp, low, high, open, close, volume] newest-first
      const candles: CandleData[] = data.map(c => ({
        time:   c[0],
        low:    c[1],
        high:   c[2],
        open:   c[3],
        close:  c[4],
        volume: c[5],
      })).sort((a, b) => a.time - b.time)

      return candles.slice(-limit)
    } catch (err: any) {
      console.error(`[market] Failed to fetch ${symbol} candles:`, err.message ?? err)
      return []
    }
  }

  /**
   * Persist candles into local database for offline/caching use.
   */
  async persistCandles(symbol: string, candles: CandleData[], interval: string): Promise<void> {
    await withTransaction(async () => {
      for (const c of candles) {
        try {
          const ts = new Date(c.time * 1000).toISOString();
          await run(
            `INSERT OR IGNORE INTO ohlcv_candles
               (symbol, exchange, interval, ts, open, high, low, close, volume)
             VALUES (?, 'coinbase', ?, ?, ?, ?, ?, ?, ?)`,
            [symbol, interval, ts, c.open, c.high, c.low, c.close, c.volume]
          );
        } catch { /* duplicate — ignore */ }
      }
    });
  }
}
