import { EventEmitter } from 'events';
import axios from 'axios';
import { query, run, getSetting } from '../db/client.js';
import { config } from '../config.js';

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

export class PredictionService extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private readonly ML_API = config.ML_SERVICE_URL;
  // Poll every hour to match the 1h candle granularity
  private readonly INTERVAL_MS = 60 * 60 * 1000; 

  public start(): void {
    if (this.intervalId) return;

    // Run immediately, then scale up the interval
    setTimeout(() => this.runAll(), 10_000); 

    this.intervalId = setInterval(() => {
      this.runAll();
    }, this.INTERVAL_MS);

    console.info('[prediction-engine] Auto-inference background job scheduled (every 1hr)');
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  public async runAll(): Promise<void> {
    const symbols = ['BTC-USD', 'ETH-USD'];
    console.info(`[prediction-engine] Triggering hourly inference cycle for ${symbols.join(', ')}...`);

    for (const symbol of symbols) {
      try {
        await this.generatePredictions(symbol);
      } catch (err) {
        console.error(`[prediction-engine] Inference failed for ${symbol}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  public async generatePredictions(symbol: string): Promise<MLPredictionResponse[]> {
    const normalizedSymbol = symbol.toUpperCase();
    const horizons = ['1h', '4h', '24h'];

    const rows = await query<any>(
      `SELECT ts as timestamp, open, high, low, close, volume
       FROM ohlcv_candles
       WHERE symbol = ? AND interval = '1h'
       ORDER BY ts DESC
       LIMIT 1000`,
      [normalizedSymbol]
    );

    rows.reverse();

    if (!rows.length) {
      throw new Error(`No candle data available for ${normalizedSymbol}`);
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

    // Note: We don't merge sentiment or greed scores into the bg job yet
    // as it would require pulling them from the DB, but XGBoost works without them too.

    const mlApiUrl = await getSetting('ML_SERVICE_URL') || config.ML_SERVICE_URL;

    for (const horizon of horizons) {
      try {
        const mlRequest: MLPredictionRequest = {
          symbol: normalizedSymbol,
          horizon: horizon as '1h' | '4h' | '24h',
          candles,
        };

        const mlResponse = await axios.post<MLPredictionResponse>(
          `${mlApiUrl}/predict`,
          mlRequest,
          { timeout: 30_000 }
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
          ]
        );
      } catch (err) {
        throw new Error(`Horizon ${horizon} failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.info(`[prediction-engine] Successfully mapped ${predictions.length} horizon inferences for ${normalizedSymbol}`);
    return predictions;
  }
}

export const predictionService = new PredictionService();
