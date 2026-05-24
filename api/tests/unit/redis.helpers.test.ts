import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isWhaleAddress,
  addWhaleAddress,
  removeWhaleAddress,
  syncWhaleAddressSet,
  redisKey,
  checkRedisHealth,
  closeRedis,
} from '../../src/db/redis.js';

describe('Redis Helpers (Local Mock)', () => {
  beforeEach(async () => {
    await closeRedis();
    vi.clearAllMocks();
  });

  // ── redisKey builders ────────────────────────────────────────────────────────
  describe('redisKey', () => {
    it('should uppercase symbols in ticker keys', () => {
      expect(redisKey.ticker('btc-usd', 'coinbase')).toBe('cache:ticker:coinbase:BTC-USD');
    });

    it('should build correct whale address set key', () => {
      expect(redisKey.whaleAddressSet('ethereum')).toBe('whale:addresses:ethereum');
    });

    it('should build dedup key with type and identifier', () => {
      expect(redisKey.alertDedup('whale_buy', '0xtxhash')).toBe('dedup:alert:whale_buy:0xtxhash');
    });

    it('should build fear greed cache key', () => {
      expect(redisKey.fearGreed()).toBe('cache:fear_greed:latest');
    });

    it('should build prediction key with uppercase symbol', () => {
      expect(redisKey.prediction('btc-usd', '1h')).toBe('cache:prediction:BTC-USD:1h');
    });
  });

  // ── isWhaleAddress ────────────────────────────────────────────────────────────
  describe('isWhaleAddress', () => {
    it('should return true when address is in the whale set', async () => {
      await addWhaleAddress(null, '0xabc', 'ethereum');
      const result = await isWhaleAddress(null, '0xabc', 'ethereum');
      expect(result).toBe(true);
    });

    it('should return false when address is not in the set', async () => {
      const result = await isWhaleAddress(null, '0xdef', 'ethereum');
      expect(result).toBe(false);
    });

    it('should lowercase address before lookup', async () => {
      await addWhaleAddress(null, '0xabc', 'ethereum');
      const result = await isWhaleAddress(null, '0xABC', 'ethereum');
      expect(result).toBe(true);
    });
  });

  // ── addWhaleAddress ────────────────────────────────────────────────────────────
  describe('addWhaleAddress', () => {
    it('should add lowercase address to chain-specific set', async () => {
      await addWhaleAddress(null, '0xABC123', 'bsc');
      expect(await isWhaleAddress(null, '0xabc123', 'bsc')).toBe(true);
    });
  });

  // ── removeWhaleAddress ────────────────────────────────────────────────────────
  describe('removeWhaleAddress', () => {
    it('should remove address from the correct chain set', async () => {
      await addWhaleAddress(null, '0xdef', 'solana');
      await removeWhaleAddress(null, '0xdef', 'solana');
      expect(await isWhaleAddress(null, '0xdef', 'solana')).toBe(false);
    });
  });

  // ── syncWhaleAddressSet ───────────────────────────────────────────────────────
  describe('syncWhaleAddressSet', () => {
    it('should group by chain and update internal sets', async () => {
      await syncWhaleAddressSet(null, [
        { address: '0xAA', chain: 'ethereum' },
        { address: '0xBB', chain: 'ethereum' },
        { address: '0xCC', chain: 'bsc' },
      ]);

      expect(await isWhaleAddress(null, '0xaa', 'ethereum')).toBe(true);
      expect(await isWhaleAddress(null, '0xbb', 'ethereum')).toBe(true);
      expect(await isWhaleAddress(null, '0xcc', 'bsc')).toBe(true);
    });

    it('should lowercase all addresses during sync', async () => {
      await syncWhaleAddressSet(null, [
        { address: '0xABCDEF', chain: 'ethereum' },
      ]);
      expect(await isWhaleAddress(null, '0xabcdef', 'ethereum')).toBe(true);
    });

    it('should handle empty list without error', async () => {
      await expect(
        syncWhaleAddressSet(null, [])
      ).resolves.not.toThrow();
    });
  });

  // ── checkRedisHealth ──────────────────────────────────────────────────────────
  describe('checkRedisHealth', () => {
    it('should return connected=true and type in-memory', async () => {
      const health = await checkRedisHealth();
      expect(health.connected).toBe(true);
      expect(health.type).toBe('in-memory');
    });
  });
});
