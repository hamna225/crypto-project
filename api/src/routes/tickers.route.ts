import type { FastifyInstance } from 'fastify';
import { query, run } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { MarketService } from '../services/market.service.js';

const marketService = new MarketService();

export async function tickerRoutes(app: FastifyInstance): Promise<void> {

  // ── GET /api/tickers ──────────────────────────────────────────────────────
  app.get('/tickers', async (_req, reply) => {
    try {
      const result = await query<any>(
        `SELECT symbol, exchange, price, price_change_24h, price_change_pct_24h,
                volume_24h, market_cap, updated_at
         FROM tickers ORDER BY market_cap DESC LIMIT 100`
      );
      await reply.send({ success: true, data: result, meta: { total: result.length } });
    } catch {
      await reply.send({ success: true, data: [], meta: { total: 0 } });
    }
  });

  // ── GET /api/tickers/:symbol ──────────────────────────────────────────────
  app.get<{ Params: { symbol: string } }>('/tickers/:symbol', async (req, reply) => {
    const symbol = req.params.symbol.toUpperCase();
    try {
      const result = await query<any>(
        `SELECT * FROM tickers WHERE symbol = ? ORDER BY updated_at DESC LIMIT 1`,
        [symbol]
      );
      if (!result.length) throw new AppError(404, 'NOT_FOUND', `Ticker ${symbol} not found`);
      await reply.send({ success: true, data: result[0] });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, 'DB_UNAVAILABLE', 'Database unavailable');
    }
  });

  // ── GET /api/tickers/:symbol/candles ─────────────────────────────────────
  // Returns candle data: checks local SQLite first, falls back to Coinbase API
  app.get<{
    Params: { symbol: string };
    Querystring: { interval?: string; limit?: string };
  }>('/tickers/:symbol/candles', async (req, reply) => {
    const symbol   = req.params.symbol.toUpperCase();
    const interval = req.query.interval ?? '1h';
    const limit    = Math.min(parseInt(req.query.limit ?? '150', 10), 500);

    try {
      // 1 — Check local SQLite cache
      let rows = await query<any>(
        `SELECT ts AS timestamp, open, high, low, close, volume
         FROM ohlcv_candles
         WHERE symbol = ? AND interval = ?
         ORDER BY ts DESC LIMIT ?`,
        [symbol, interval, limit]
      );

      const GRANULARITY: Record<string, number> = {
        '1m': 60, '5m': 300, '15m': 900,
        '1h': 3600, '6h': 21600, '1d': 86400,
      };
      
      const granularitySeconds = GRANULARITY[interval] ?? 3600;
      const now = Date.now();
      const latestTs = rows.length > 0 ? new Date(rows[0].timestamp).getTime() : 0;
      const isFresh = now - latestTs < (granularitySeconds * 2 * 1000);

      if (rows.length >= 20 && isFresh) {
        // Have enough local data — return it
        rows.reverse();
        return await reply.send({ success: true, data: rows, meta: { source: 'local', total: rows.length } });
      }

      // 2 — Fetch fresh from Coinbase
      const candles = await marketService.getCandles(symbol, interval, limit);
      if (candles.length > 0) {
        // Async persist (don't await — we don't want to block the response)
        setImmediate(() => marketService.persistCandles(symbol, candles, interval));
      }

      const data = candles.map(c => ({
        timestamp: new Date(c.time * 1000).toISOString(),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
        volume: c.volume,
      }));

      await reply.send({ success: true, data, meta: { source: 'coinbase', total: data.length } });
    } catch (err: any) {
      await reply.send({ success: false, data: [], error: err.message });
    }
  });
}
