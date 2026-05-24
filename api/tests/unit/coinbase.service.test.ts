import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mock deps before importing service ───────────────────────────────────────
vi.mock('ws', () => {
  const WS = vi.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    Object.assign(emitter, {
      readyState: 1, // OPEN
      send: vi.fn(),
      terminate: vi.fn(),
    });
    // Simulate open immediately in next tick
    setImmediate(() => emitter.emit('open'));
    return emitter;
  });
  (WS as any).OPEN = 1;
  return { default: WS };
});

vi.mock('../../src/config.js', () => ({
  config: {
    COINBASE_WS_URL: 'wss://test.coinbase.com',
    NODE_ENV: 'test',
  },
}));

vi.mock('../../src/db/redis.js', () => ({
  getRedis: () => ({ set: vi.fn(), publish: vi.fn() }),
  redisKey: { ticker: (sym: string, ex: string) => `cache:ticker:${ex}:${sym}` },
}));

import { CoinbaseService } from '../../src/services/coinbase.service.js';

describe('CoinbaseService', () => {
  let service: CoinbaseService;

  beforeEach(() => {
    service = new CoinbaseService(['BTC-USD', 'ETH-USD']);
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.disconnect();
  });

  describe('initialization', () => {
    it('should start in disconnected state', () => {
      expect(service.isConnected).toBe(false);
    });

    it('should throw when connect() called after destroy', () => {
      service.disconnect();
      expect(() => service.connect()).toThrow('CoinbaseService has been destroyed');
    });
  });

  describe('message handling', () => {
    it('should emit ticker events for valid ticker messages', () => {
      const emittedTickers: any[] = [];
      service.on('ticker', (t) => emittedTickers.push(t));

      // Access private method for unit testing via any cast
      (service as any).handleMessage(JSON.stringify({
        type: 'ticker',
        events: [{
          tickers: [{
            product_id: 'BTC-USD',
            price: '67500.00',
            price_percent_chg_24h: '2.5',
            volume_24h: '12345.67',
          }],
        }],
      }));

      expect(emittedTickers).toHaveLength(1);
      expect(emittedTickers[0]).toMatchObject({
        symbol: 'BTC-USD',
        exchange: 'coinbase',
        price: 67500,
        priceChangePct24h: 2.5,
        volume24h: 12345.67,
      });
      expect(emittedTickers[0]!.updatedAt).toBeInstanceOf(Date);
    });

    it('should discard messages with invalid price', () => {
      const emittedTickers: any[] = [];
      service.on('ticker', (t) => emittedTickers.push(t));

      (service as any).handleMessage(JSON.stringify({
        type: 'ticker',
        events: [{ tickers: [{ product_id: 'BTC-USD', price: 'NaN' }] }],
      }));

      expect(emittedTickers).toHaveLength(0);
    });

    it('should discard messages with missing product_id', () => {
      const emittedTickers: any[] = [];
      service.on('ticker', (t) => emittedTickers.push(t));

      (service as any).handleMessage(JSON.stringify({
        type: 'ticker',
        events: [{ tickers: [{ price: '100' }] }],
      }));

      expect(emittedTickers).toHaveLength(0);
    });

    it('should handle malformed JSON without crashing', () => {
      expect(() => {
        (service as any).handleMessage('{{not valid json}}');
      }).not.toThrow();
    });

    it('should ignore non-ticker message types', () => {
      const emittedTickers: any[] = [];
      service.on('ticker', (t) => emittedTickers.push(t));

      (service as any).handleMessage(JSON.stringify({
        type: 'subscriptions',
        channels: ['ticker'],
      }));

      expect(emittedTickers).toHaveLength(0);
    });
  });

  describe('normalizeTicker', () => {
    it('should correctly calculate priceChange24h from percentage', () => {
      const ticker = (service as any).normalizeTicker({
        product_id: 'ETH-USD',
        price: '3000',
        price_percent_chg_24h: '5',
        volume_24h: '50000',
      });

      expect(ticker).not.toBeNull();
      expect(ticker.priceChangePct24h).toBe(5);
      // priceChange24h = 5/100 * 3000 = 150
      expect(ticker.priceChange24h).toBeCloseTo(150, 2);
    });

    it('should default missing fields to zero', () => {
      const ticker = (service as any).normalizeTicker({
        product_id: 'ETH-USD',
        price: '3000',
      });

      expect(ticker.priceChangePct24h).toBe(0);
      expect(ticker.volume24h).toBe(0);
    });
  });

  describe('reconnection logic', () => {
    it('should schedule reconnect with exponential back-off', () => {
      vi.useFakeTimers();
      const connectSpy = vi.spyOn(service as any, 'createConnection');

      // Simulate first disconnect
      (service as any).reconnectAttempts = 0;
      (service as any).isDestroyed = false;
      (service as any).scheduleReconnect();

      // First attempt: 500ms * 2^0 = 500ms
      vi.advanceTimersByTime(500);
      expect(connectSpy).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should stop reconnecting after max attempts', () => {
      const errorEvents: Error[] = [];
      service.on('error', (e) => errorEvents.push(e));

      (service as any).reconnectAttempts = 15;
      (service as any).isDestroyed = false;
      (service as any).scheduleReconnect();

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]!.message).toContain('Max reconnect attempts');
    });

    it('should not reconnect when isDestroyed is true', () => {
      const connectSpy = vi.spyOn(service as any, 'createConnection');
      (service as any).isDestroyed = true;
      (service as any).scheduleReconnect();

      // scheduleReconnect shouldn't be called when destroyed
      expect(connectSpy).not.toHaveBeenCalled();
    });
  });
});
