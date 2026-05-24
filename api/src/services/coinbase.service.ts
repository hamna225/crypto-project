import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import type { Ticker } from '../../../shared/types/index.js';
import { config } from '../config.js';
import { getRedis, redisKey } from '../db/redis.js';

// ─── Coinbase Advanced Trade WebSocket Service ────────────────────────────────
// Connects to Coinbase's real-time ticker channel and emits normalized Ticker
// objects. Implements exponential back-off reconnection and heartbeat monitoring.

export interface CoinbaseServiceEvents {
  ticker: (ticker: Ticker) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
}

export declare interface CoinbaseService {
  on<K extends keyof CoinbaseServiceEvents>(event: K, listener: CoinbaseServiceEvents[K]): this;
  emit<K extends keyof CoinbaseServiceEvents>(event: K, ...args: Parameters<CoinbaseServiceEvents[K]>): boolean;
}

export class CoinbaseService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 15;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastMessageAt = 0;
  private readonly HEARTBEAT_INTERVAL_MS = 30_000;
  private readonly HEARTBEAT_TIMEOUT_MS = 60_000;
  private isDestroyed = false;

  constructor(private readonly productIds: string[]) {
    super();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  connect(): void {
    if (this.isDestroyed) throw new Error('CoinbaseService has been destroyed');
    this.createConnection();
  }

  disconnect(): void {
    this.isDestroyed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private createConnection(): void {
    this.ws = new WebSocket(config.COINBASE_WS_URL);

    this.ws.on('open', () => {
      console.info('[coinbase-ws] Connected');
      this.reconnectAttempts = 0;
      this.subscribe();
      this.startHeartbeatMonitor();
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.lastMessageAt = Date.now();
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      console.error('[coinbase-ws] Socket error:', err.message);
      this.emit('error', err);
    });

    this.ws.on('close', (code, reason) => {
      const reasonStr = reason.toString();
      console.warn(`[coinbase-ws] Disconnected (code=${code}, reason=${reasonStr})`);
      this.clearTimers();
      this.emit('disconnected', code, reasonStr);

      if (!this.isDestroyed) {
        this.scheduleReconnect();
      }
    });
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const subscribeMsg = {
      type: 'subscribe',
      product_ids: this.productIds,
      channel: 'ticker',
      // JWT auth would go here for private channels
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    console.info(`[coinbase-ws] Subscribed to ticker: ${this.productIds.join(', ')}`);
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;

    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.warn('[coinbase-ws] Failed to parse message:', raw.slice(0, 100));
      return;
    }

    if (msg['type'] === 'ticker' && msg['events']) {
      const events = msg['events'] as Array<Record<string, unknown>>;
      for (const event of events) {
        const tickers = (event['tickers'] ?? []) as Array<Record<string, unknown>>;
        for (const raw of tickers) {
          const ticker = this.normalizeTicker(raw);
          if (ticker) {
            this.cacheTicker(ticker);
            this.emit('ticker', ticker);
          }
        }
      }
    }
  }

  private normalizeTicker(raw: Record<string, unknown>): Ticker | null {
    const price = Number(raw['price']);
    const symbol = String(raw['product_id'] ?? '');

    if (!symbol || isNaN(price) || price <= 0) return null;

    return {
      symbol,
      exchange: 'coinbase',
      price,
      priceChange24h: Number(raw['price_percent_chg_24h'] ?? 0) / 100 * price,
      priceChangePct24h: Number(raw['price_percent_chg_24h'] ?? 0),
      volume24h: Number(raw['volume_24h'] ?? 0),
      updatedAt: new Date(),
    };
  }

  private async cacheTicker(ticker: Ticker): Promise<void> {
    try {
      const redis = getRedis();
      await redis.set(
        redisKey.ticker(ticker.symbol, ticker.exchange),
        JSON.stringify(ticker),
        'EX',
        60, // 60-second TTL
      );
    } catch (err) {
      console.error('[coinbase-ws] Failed to cache ticker:', err);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[coinbase-ws] Max reconnect attempts reached. Giving up.');
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    // Exponential back-off: 500ms * 2^attempt, capped at 30s
    const delayMs = Math.min(500 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts++;

    console.info(
      `[coinbase-ws] Reconnecting in ${delayMs}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => this.createConnection(), delayMs);
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const timeSinceLastMsg = Date.now() - this.lastMessageAt;

      if (this.lastMessageAt > 0 && timeSinceLastMsg > this.HEARTBEAT_TIMEOUT_MS) {
        console.warn('[coinbase-ws] Heartbeat timeout — forcing reconnect');
        this.ws?.terminate();
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
  }
}
