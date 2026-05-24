import type { Ticker } from '../../../shared/types/index.js';
import { REDIS_CHANNELS } from '../../../shared/types/index.js';
import { config } from '../config.js';
import { getRedis } from '../db/redis.js';
import { query } from '../db/client.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Price Spike / Crash Monitor ─────────────────────────────────────────────
// Subscribes to the real-time price tick stream and evaluates whether recent
// price movement crosses the configured spike/crash thresholds.
// On trigger: publishes to alerts:price channel for the Alert Engine.

interface PriceWindow {
  price: number;
  timestamp: number;
}

export class PriceMonitor {
  // Rolling price windows per symbol: symbol → array of {price, timestamp}
  private readonly windows = new Map<string, PriceWindow[]>();
  private readonly WINDOW_MS: number;

  constructor() {
    this.WINDOW_MS = config.PRICE_SPIKE_WINDOW_MIN * 60 * 1000;
  }

  /**
   * Process an incoming ticker and evaluate spike/crash thresholds.
   * Called on every tick from the Coinbase WebSocket.
   */
  async processTick(ticker: Ticker): Promise<void> {
    const { symbol, price } = ticker;
    const now = Date.now();

    // Initialize window for new symbols
    if (!this.windows.has(symbol)) {
      this.windows.set(symbol, []);
    }

    const window = this.windows.get(symbol)!;

    // Trim entries outside the rolling window
    const cutoff = now - this.WINDOW_MS;
    const trimmed = window.filter((w) => w.timestamp >= cutoff);
    trimmed.push({ price, timestamp: now });
    this.windows.set(symbol, trimmed);

    // Need at least 2 data points to compute change
    if (trimmed.length < 2) return;

    const oldest = trimmed[0]!;
    const pctChange = ((price - oldest.price) / oldest.price) * 100;

    if (pctChange >= config.PRICE_SPIKE_PCT) {
      await this.fireAlert('price_spike', symbol, pctChange, price);
    } else if (pctChange <= -config.PRICE_CRASH_PCT) {
      await this.fireAlert('price_crash', symbol, pctChange, price);
    }
  }

  private async fireAlert(
    type: 'price_spike' | 'price_crash',
    symbol: string,
    pctChange: number,
    currentPrice: number,
  ): Promise<void> {
    const redis = getRedis();

    // Deduplicate: don't re-alert for same symbol within 1 window period
    const dedupKey = `dedup:alert:${type}:${symbol}`;
    const alreadyFired = await redis.set(dedupKey, '1', 'EX', config.PRICE_SPIKE_WINDOW_MIN * 60, 'NX');
    if (alreadyFired === null) return;

    const direction = pctChange > 0 ? '📈' : '📉';
    const severity = type === 'price_crash' ? 'critical' : 'high';

    const payload = {
      id: uuidv4(),
      type,
      severity,
      title: `${direction} ${symbol} ${type === 'price_spike' ? 'Spike' : 'Crash'}: ${pctChange.toFixed(2)}%`,
      body: `${symbol} moved ${pctChange > 0 ? '+' : ''}${pctChange.toFixed(2)}% in ${config.PRICE_SPIKE_WINDOW_MIN}min. Current: $${currentPrice.toLocaleString()}`,
      metadata: { symbol, pctChange, currentPrice, windowMin: config.PRICE_SPIKE_WINDOW_MIN },
      timestamp: new Date().toISOString(),
    };

    await redis.publish(REDIS_CHANNELS.ALERT_PRICE, JSON.stringify(payload));
  }

  /**
   * Returns the current price change for a symbol within the monitoring window.
   * Used by the dashboard to show live momentum.
   */
  getWindowChange(symbol: string): number | null {
    const window = this.windows.get(symbol);
    if (!window || window.length < 2) return null;

    const oldest = window[0]!;
    const latest = window[window.length - 1]!;
    return ((latest.price - oldest.price) / oldest.price) * 100;
  }

  /** Clear all windows — useful for testing */
  reset(): void {
    this.windows.clear();
  }
}
