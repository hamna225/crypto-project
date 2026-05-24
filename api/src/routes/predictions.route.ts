import type { FastifyInstance } from 'fastify';
import { query, run } from '../db/client.js';
import { AppError } from '../middleware/error-handler.js';
import { config } from '../config.js';
import axios from 'axios';

interface MLPredictionRequest {
  symbol: string;
  horizon: '1h' | '4h' | '24h';
  candles: Array<{
    ts: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  sentiment_score?: number;
  fear_greed_score?: number;
}

interface MLPredictionResponse {
  symbol: string;
  horizon: string;
  direction: string;
  confidence: number;
  trend_strength: string;
  price_low: number;
  price_high: number;
  probabilities: Record<string, number>;
  model_version: string;
}

const ML_API_BASE_URL = config.ML_SERVICE_URL;

export async function predictionsRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/predictions/latest — Most recent predictions across all coins ──
  app.get('/predictions/latest', async (_req, reply) => {
    try {
      const result = await query<any>(`
        SELECT p1.id, p1.symbol, p1.horizon, p1.direction, p1.confidence, p1.price_low, p1.price_high, p1.trend_strength, p1.model_version, p1.generated_at
        FROM price_predictions p1
        INNER JOIN (
            SELECT symbol, horizon, MAX(generated_at) as max_at 
            FROM price_predictions 
            GROUP BY symbol, horizon
        ) p2 ON p1.symbol = p2.symbol AND p1.horizon = p2.horizon AND p1.generated_at = p2.max_at
        ORDER BY p1.symbol ASC, p1.horizon ASC
      `);
      
      const data = result.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        horizon: row.horizon,
        direction: row.direction,
        confidence: row.confidence,
        price_low: row.price_low,
        price_high: row.price_high,
        trend_strength: row.trend_strength,
        model_version: row.model_version,
        generatedAt: row.generated_at,
      }));

      await reply.send({ success: true, data, meta: { total: data.length } });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, 'DB_UNAVAILABLE', 'Database unavailable');
    }
  });

  // ── GET /api/predictions/:symbol — Latest predictions for symbol ──────────
  app.get<{
    Params: { symbol: string };
    Querystring: { horizon?: string; limit?: string };
  }>('/predictions/:symbol', async (req, reply) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const horizon = req.query.horizon;
      const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 1000);

      let sql = `SELECT id, symbol, horizon, direction, confidence, price_low, price_high,
                        trend_strength, model_version, generated_at
                 FROM price_predictions
                 WHERE symbol = ?`;
      const params: (string | number)[] = [symbol];

      if (horizon) {
        sql += ` AND horizon = ?`;
        params.push(horizon);
      }

      sql += ` ORDER BY generated_at DESC LIMIT ?`;
      params.push(limit);

      const result = await query<any>(sql, params);

      const data = result.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        horizon: row.horizon,
        direction: row.direction,
        confidence: row.confidence,
        priceLow: row.price_low,
        priceHigh: row.price_high,
        trendStrength: row.trend_strength,
        modelVersion: row.model_version,
        generatedAt: row.generated_at,
      }));

      await reply.send({
        success: true,
        data,
        meta: { total: result.length, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, 'DB_UNAVAILABLE', 'Database unavailable');
    }
  });

  // ── POST /api/predictions/run — Trigger fresh ML prediction ───────────────
  app.post<{
    Body: {
      symbol: string;
      horizons?: ('1h' | '4h' | '24h')[];
      sentiment_score?: number;
      fear_greed_score?: number;
    };
  }>('/predictions/run', async (req, reply) => {
    try {
      const { symbol, horizons = ['1h', '4h', '24h'], sentiment_score, fear_greed_score } = req.body;
      const normalizedSymbol = symbol.toUpperCase();

      if (!normalizedSymbol || normalizedSymbol.length < 2) {
        throw new AppError(400, 'INVALID_INPUT', 'Invalid symbol');
      }

      if (!Array.isArray(horizons) || horizons.length === 0) {
        throw new AppError(400, 'INVALID_INPUT', 'horizons must be non-empty array of 1h|4h|24h');
      }

      const rows = await query<any>(
        `SELECT symbol, exchange, ts as timestamp, open, high, low, close, volume, interval
         FROM ohlcv_candles
         WHERE symbol = ? AND interval = '1h'
         ORDER BY ts DESC
         LIMIT 1000`,
        [normalizedSymbol],
      );
      
      rows.reverse(); // ML engine expects chronological ascending order

      if (!rows.length) {
        throw new AppError(
          404,
          'INSUFFICIENT_DATA',
          `No candle data available for ${normalizedSymbol}`,
        );
      }

      const candles = rows.map((row) => ({
        ts: row.timestamp,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseFloat(row.volume),
      }));

      const predictions: MLPredictionResponse[] = [];
      const errors: string[] = [];

      for (const horizon of horizons) {
        try {
          const mlRequest: MLPredictionRequest = {
            symbol: normalizedSymbol,
            horizon: horizon as '1h' | '4h' | '24h',
            candles,
            sentiment_score,
            fear_greed_score,
          };

          const mlResponse = await axios.post<MLPredictionResponse>(
            `${ML_API_BASE_URL}/predict`,
            mlRequest,
            { timeout: 30_000 },
          );

          predictions.push(mlResponse.data);

          await run(
            `INSERT INTO price_predictions
             (symbol, horizon, direction, confidence, price_low, price_high, trend_strength, model_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              normalizedSymbol,
              horizon,
              mlResponse.data.direction,
              Math.round(mlResponse.data.confidence),
              mlResponse.data.price_low,
              mlResponse.data.price_high,
              mlResponse.data.trend_strength,
              mlResponse.data.model_version,
            ],
          );
        } catch (horizonErr) {
          const msg = horizonErr instanceof Error ? horizonErr.message : String(horizonErr);
          errors.push(`${horizon}: ${msg}`);
        }
      }

      if (predictions.length === 0) {
        throw new AppError(
          503,
          'ML_SERVICE_ERROR',
          `ML service unavailable: ${errors.join('; ')}`,
        );
      }

      await reply.send({
        success: true,
        data: {
          symbol: normalizedSymbol,
          predictions,
          errors: errors.length > 0 ? errors : undefined,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (axios.isAxiosError(err)) {
        throw new AppError(
          err.response?.status ?? 503,
          'ML_SERVICE_ERROR',
          err.response?.data?.detail ?? err.message,
        );
      }
      throw new AppError(500, 'INTERNAL_ERROR', String(err));
    }
  });
}
