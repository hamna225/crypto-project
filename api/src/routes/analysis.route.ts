import type { FastifyInstance } from 'fastify';
import { getSetting } from '../db/client.js';
import { config } from '../config.js';
import axios from 'axios';
import { AppError } from '../middleware/error-handler.js';
import { tradingAnalyzerService } from '../services/trading-analyzer.service.js';

export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/analysis/technical ─────────────────────────────────────────────
  app.get<{ Querystring: { symbol?: string; limit?: string } }>(
    '/analysis/technical',
    async (req, reply) => {
      const symbol = (req.query.symbol ?? 'BTC-USD').toUpperCase();
      const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 500);

      try {
        const binanceSymbol = symbol.replace('-USD', 'USDT').replace('-', '');
        const apiKey = await getSetting('BINANCE_API_KEY') ?? config.BINANCE_API_KEY;

        const headers: Record<string, string> = {};
        if (apiKey) {
          headers['X-MBX-APIKEY'] = apiKey;
        }

        const binanceRes = await axios.get(`https://api.binance.com/api/v3/klines`, {
          params: { symbol: binanceSymbol, interval: '1h', limit },
          headers,
          timeout: 10000,
        });

        const data = binanceRes.data;

        if (!Array.isArray(data) || data.length === 0) {
          throw new AppError(404, 'NOT_FOUND', `No candle data available for ${binanceSymbol} on Binance`);
        }

        const candles = data.map((kline: any) => ({
          ts: new Date(kline[0]).toISOString(),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5]),
        }));

        const analysis = tradingAnalyzerService.analyze(candles);

        await reply.send({ success: true, symbol: binanceSymbol, data: analysis });
      } catch (err) {
        if (err instanceof AppError) throw err;
        await reply.status(500).send({
          success: false,
          error: (err as Error).message || 'Calculation error',
        });
      }
    },
  );
}
