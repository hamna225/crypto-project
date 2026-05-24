import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  config: {
    PRICE_SPIKE_PCT: 5,
    PRICE_CRASH_PCT: 7,
    PRICE_SPIKE_WINDOW_MIN: 15,
    NODE_ENV: 'test',
  },
}));

const mockSet = vi.fn();
const mockPublish = vi.fn();

vi.mock('../../src/db/redis.js', () => ({
  getRedis: () => ({ set: mockSet, publish: mockPublish }),
  redisKey: {},
}));

vi.mock('../../src/db/client.js', () => ({ query: vi.fn() }));
vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { PriceMonitor } from '../../src/utils/price-monitor.js';

const makeTicker = (symbol: string, price: number) => ({
  symbol, exchange: 'coinbase', price,
  priceChange24h: 0, priceChangePct24h: 0, volume24h: 0,
  updatedAt: new Date(),
});

describe('PriceMonitor', () => {
  let monitor: PriceMonitor;

  beforeEach(() => {
    monitor = new PriceMonitor();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('processTick — no alert scenarios', () => {
    it('should not fire alert on first tick (single data point)', async () => {
      await monitor.processTick(makeTicker('BTC-USD', 67000));
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('should not fire alert when change is below spike threshold', async () => {
      mockSet.mockResolvedValue('OK');
      await monitor.processTick(makeTicker('BTC-USD', 67000));
      // 3% move — below 5% threshold
      await monitor.processTick(makeTicker('BTC-USD', 67000 * 1.03));
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('should not fire alert when change is below crash threshold', async () => {
      mockSet.mockResolvedValue('OK');
      await monitor.processTick(makeTicker('BTC-USD', 67000));
      // -5% move — below 7% crash threshold
      await monitor.processTick(makeTicker('BTC-USD', 67000 * 0.95));
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });

  describe('processTick — spike alert', () => {
    it('should fire price_spike alert when price rises above threshold', async () => {
      mockSet.mockResolvedValue('OK'); // NX set succeeds (not a duplicate)

      await monitor.processTick(makeTicker('BTC-USD', 67000));
      // +6% move — above 5% threshold
      await monitor.processTick(makeTicker('BTC-USD', 67000 * 1.06));

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const [channel, payload] = mockPublish.mock.calls[0]!;
      expect(channel).toBe('alerts:price');

      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe('price_spike');
      expect(parsed.severity).toBe('high');
      expect(parsed.title).toContain('BTC-USD');
      expect(parsed.title).toContain('Spike');
    });

    it('should suppress duplicate spike alert within dedup window', async () => {
      mockSet
        .mockResolvedValueOnce('OK')   // first alert goes through
        .mockResolvedValueOnce(null);  // second is duplicate (NX fails)

      await monitor.processTick(makeTicker('BTC-USD', 67000));
      await monitor.processTick(makeTicker('BTC-USD', 67000 * 1.06));
      await monitor.processTick(makeTicker('BTC-USD', 67000 * 1.07)); // still in window

      expect(mockPublish).toHaveBeenCalledTimes(1); // only first fires
    });
  });

  describe('processTick — crash alert', () => {
    it('should fire price_crash alert when price drops below crash threshold', async () => {
      mockSet.mockResolvedValue('OK');

      await monitor.processTick(makeTicker('ETH-USD', 3500));
      // -8% move — above 7% crash threshold
      await monitor.processTick(makeTicker('ETH-USD', 3500 * 0.92));

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const [, payload] = mockPublish.mock.calls[0]!;
      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe('price_crash');
      expect(parsed.severity).toBe('critical');
      expect(parsed.metadata.pctChange).toBeLessThan(0);
    });
  });

  describe('window trimming', () => {
    it('should trim entries older than the monitoring window', async () => {
      mockSet.mockResolvedValue('OK');

      await monitor.processTick(makeTicker('BTC-USD', 67000));

      // Advance time past the 15-minute window
      vi.advanceTimersByTime(16 * 60 * 1000);

      await monitor.processTick(makeTicker('BTC-USD', 67000 * 1.10)); // +10%

      // Old entry should be trimmed, so only 1 data point remains → no alert
      expect(mockPublish).not.toHaveBeenCalled();
    });
  });

  describe('getWindowChange', () => {
    it('should return null for symbol with no data', () => {
      expect(monitor.getWindowChange('BTC-USD')).toBeNull();
    });

    it('should return null for symbol with single data point', async () => {
      await monitor.processTick(makeTicker('BTC-USD', 67000));
      expect(monitor.getWindowChange('BTC-USD')).toBeNull();
    });

    it('should return correct percentage change', async () => {
      await monitor.processTick(makeTicker('BTC-USD', 100));
      await monitor.processTick(makeTicker('BTC-USD', 105));
      const change = monitor.getWindowChange('BTC-USD');
      expect(change).toBeCloseTo(5, 1);
    });

    it('should return negative value on price decline', async () => {
      await monitor.processTick(makeTicker('ETH-USD', 100));
      await monitor.processTick(makeTicker('ETH-USD', 90));
      const change = monitor.getWindowChange('ETH-USD');
      expect(change).toBeCloseTo(-10, 1);
    });
  });

  describe('reset', () => {
    it('should clear all tracking windows', async () => {
      await monitor.processTick(makeTicker('BTC-USD', 67000));
      monitor.reset();
      expect(monitor.getWindowChange('BTC-USD')).toBeNull();
    });
  });

  describe('multiple symbols', () => {
    it('should track symbols independently', async () => {
      mockSet.mockResolvedValue('OK');

      // BTC spikes +6%
      await monitor.processTick(makeTicker('BTC-USD', 67000));
      await monitor.processTick(makeTicker('BTC-USD', 67000 * 1.06));

      // ETH moves only 2%
      await monitor.processTick(makeTicker('ETH-USD', 3500));
      await monitor.processTick(makeTicker('ETH-USD', 3500 * 1.02));

      // Only BTC should have fired
      expect(mockPublish).toHaveBeenCalledTimes(1);
      const [, payload] = mockPublish.mock.calls[0]!;
      expect(JSON.parse(payload).metadata.symbol).toBe('BTC-USD');
    });
  });
});
