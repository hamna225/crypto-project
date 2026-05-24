import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('../../src/config.js', () => ({
  config: {
    ALCHEMY_PROJECT_ID: 'test-project-id',
    WHALE_BUY_THRESHOLD_USD: 500_000,
    WHALE_SELL_THRESHOLD_USD: 500_000,
    WHALE_TRANSFER_THRESHOLD_USD: 1_000_000,
    NODE_ENV: 'test',
  },
}));

vi.mock('../../src/db/client.js', () => ({
  query: vi.fn(),
  withTransaction: (fn: any) => fn(),
}));

vi.mock('../../src/db/redis.js', () => ({
  getRedis: () => ({
    set: vi.fn(),
    get: vi.fn(),
    publish: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    del: vi.fn(),
    pipeline: () => ({
      del: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  }),
  isWhaleAddress: vi.fn(),
  addWhaleAddress: vi.fn(),
  syncWhaleAddressSet: vi.fn(),
  redisKey: {
    whaleAddressSet: (chain: string) => `whale:addresses:${chain}`,
    alertDedup: (type: string, key: string) => `dedup:alert:${type}:${key}`,
    ticker: (sym: string, ex: string) => `cache:ticker:${ex}:${sym}`,
  },
}));

vi.mock('ethers', () => ({
  ethers: {
    WebSocketProvider: vi.fn(),
    formatEther: vi.fn((val: bigint) => (Number(val) / 1e18).toString()),
  },
}));

import { WhaleTrackerService } from '../../src/services/whale-tracker.service.js';
import { isWhaleAddress } from '../../src/db/redis.js';
import { query } from '../../src/db/client.js';

describe('WhaleTrackerService', () => {
  let service: WhaleTrackerService;

  beforeEach(() => {
    service = new WhaleTrackerService();
    vi.clearAllMocks();
  });

  describe('inferDirection', () => {
    const BINANCE_HOT = '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be';
    const RANDOM_WALLET = '0xabc123def456000000000000000000000000abcd';

    it('should infer BUY when transaction comes FROM an exchange', () => {
      const direction = (service as any).inferDirection(BINANCE_HOT, RANDOM_WALLET);
      expect(direction).toBe('buy');
    });

    it('should infer SELL when transaction goes TO an exchange', () => {
      const direction = (service as any).inferDirection(RANDOM_WALLET, BINANCE_HOT);
      expect(direction).toBe('sell');
    });

    it('should infer TRANSFER for wallet-to-wallet moves', () => {
      const wallet2 = '0xdef456abc789000000000000000000000000def4';
      const direction = (service as any).inferDirection(RANDOM_WALLET, wallet2);
      expect(direction).toBe('transfer');
    });
  });

  describe('getThreshold', () => {
    it('should return correct threshold for each direction', () => {
      expect((service as any).getThreshold('buy')).toBe(500_000);
      expect((service as any).getThreshold('sell')).toBe(500_000);
      expect((service as any).getThreshold('transfer')).toBe(1_000_000);
    });
  });

  describe('addWallet', () => {
    it('should insert wallet into DB and add to Redis set', async () => {
      const mockWallet = {
        id: 'uuid-123',
        address: '0xabc',
        chain: 'ethereum',
        alias: 'Test Whale',
        label: 'whale',
        watchedSince: new Date(),
        isActive: true,
      };

      vi.mocked(query).mockReturnValueOnce([mockWallet] as any);

      const result = await service.addWallet({
        address: '0xABC',
        chain: 'ethereum',
        alias: 'Test Whale',
        label: 'whale',
        isActive: true,
      });

      expect(result).toEqual(mockWallet);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whale_wallets'),
        expect.arrayContaining(['0xabc', 'ethereum', 'Test Whale', 'whale', 1]),
      );
    });

    it('should lowercase the address before persisting', async () => {
      vi.mocked(query).mockReturnValueOnce([{ id: 'x', address: '0xabc', chain: 'ethereum', alias: null, label: 'whale', watchedSince: new Date(), isActive: true }] as any);

      await service.addWallet({ address: '0xABC', chain: 'ethereum', label: 'whale', isActive: true });

      expect(query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['0xabc']),
      );
    });
  });

  describe('processPendingTx', () => {
    it('should skip transactions where neither party is a whale', async () => {
      vi.mocked(isWhaleAddress).mockResolvedValue(false);

      const mockProvider = {
        getTransaction: vi.fn().mockResolvedValue({
          from: '0xaaaa',
          to: '0xbbbb',
          value: BigInt(100e18),
          hash: '0xtxhash',
          blockNumber: 100,
        }),
      };
      (service as any).provider = mockProvider;

      const publishSpy = vi.fn();
      vi.mocked(isWhaleAddress).mockResolvedValue(false);

      await (service as any).processPendingTx('0xtxhash');

      // Should not persist or publish
      expect(query).not.toHaveBeenCalled();
    });

    it('should skip tx with null to/from', async () => {
      const mockProvider = {
        getTransaction: vi.fn().mockResolvedValue({ from: null, to: null, value: 0n }),
      };
      (service as any).provider = mockProvider;

      await expect((service as any).processPendingTx('0xhash')).resolves.not.toThrow();
    });

    it('should gracefully handle provider errors without crashing', async () => {
      const mockProvider = {
        getTransaction: vi.fn().mockRejectedValue(new Error('tx not found')),
      };
      (service as any).provider = mockProvider;

      await expect((service as any).processPendingTx('0xhash')).resolves.not.toThrow();
    });
  });

  describe('syncWatchList', () => {
    it('should populate Redis sets and alias map from DB', async () => {
      vi.mocked(query).mockReturnValueOnce([
        { address: '0xaaa', chain: 'ethereum', alias: 'Whale Alpha' },
        { address: '0xbbb', chain: 'bsc', alias: null },
      ] as any);

      await (service as any).syncWatchList();

      // Alias map should have only entries with aliases
      const aliasMap: Map<string, string> = (service as any).walletAliasMap;
      expect(aliasMap.get('0xaaa')).toBe('Whale Alpha');
      expect(aliasMap.has('0xbbb')).toBe(false);
    });
  });
});
