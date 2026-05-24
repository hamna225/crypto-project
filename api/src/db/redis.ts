import NodeCache from 'node-cache';
import { EventEmitter } from 'events';

// ─── Local Cache (Replacing Redis) ───────────────────────────────────────────
// We use node-cache for TTL-based storage and a simple Map for Sets/Subscriptions.

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const eventEmitter = new EventEmitter();
const sets = new Map<string, Set<string>>();

/**
 * Mocking a Redis client interface to minimize changes in other files.
 */
export const getRedis = () => ({
  get: async (key: string) => cache.get<string>(key) ?? null,
  set: async (key: string, value: string, ...args: any[]) => {
    // Check for 'NX' mode (set if not exists)
    const isNX = args.includes('NX');
    if (isNX && cache.has(key)) {
      return null;
    }

    // Check for 'EX' mode (expire in seconds)
    let duration: number | undefined;
    const exIndex = args.indexOf('EX');
    if (exIndex !== -1 && args[exIndex + 1]) {
      duration = Number(args[exIndex + 1]);
    } else if (args[0] === 'ps' || args[0] === 'EX') {
      // Handle legacy/variadic signatures if needed
      duration = Number(args[1]);
    }

    cache.set(key, value, duration || 0);
    return 'OK';
  },
  del: async (key: string) => {
    cache.del(key);
    return 1;
  },
  sismember: async (key: string, member: string) => {
    return sets.get(key)?.has(member.toLowerCase()) ? 1 : 0;
  },
  sadd: async (key: string, ...members: string[]) => {
    let s = sets.get(key);
    if (!s) {
      s = new Set<string>();
      sets.set(key, s);
    }
    members.forEach(m => s!.add(m.toLowerCase()));
    return members.length;
  },
  srem: async (key: string, ...members: string[]) => {
    const s = sets.get(key);
    if (!s) return 0;
    let count = 0;
    members.forEach(m => {
      if (s.delete(m.toLowerCase())) count++;
    });
    return count;
  },
  pipeline: () => {
    const ops: (() => void)[] = [];
    return {
      del: (key: string) => { ops.push(() => cache.del(key)); return this; },
      sadd: (key: string, ...members: string[]) => {
        ops.push(() => {
          let s = sets.get(key);
          if (!s) { s = new Set<string>(); sets.set(key, s); }
          members.forEach(m => s!.add(m.toLowerCase()));
        });
        return this;
      },
      exec: async () => {
        ops.forEach(op => op());
        return [];
      }
    } as any;
  },
  publish: async (channel: string, message: string) => {
    eventEmitter.emit(channel, message);
    return 1;
  },
  ping: async () => 'PONG',
  duplicate: () => getRedisSubscriber() as any,
});

/**
 * Mocking a Redis Subscriber interface.
 */
export const getRedisSubscriber = () => ({
  on: (event: string, callback: (...args: any[]) => void) => {
    if (event === 'message') {
      // Redis subscriber 'message' event usually passes (channel, message)
      eventEmitter.on('all_channels', (channel, message) => callback(channel, message));
    } else if (event === 'error') {
       // Ignore
    }
  },
  subscribe: async (channel: string) => {
    // Forward all events on this channel to a generic handler
    eventEmitter.on(channel, (message) => eventEmitter.emit('all_channels', channel, message));
    return 1;
  },
  disconnect: () => {
    eventEmitter.removeAllListeners();
  }
});

// ─── Typed Key Builders ───────────────────────────────────────────────────────

export const redisKey = {
  ticker: (symbol: string, exchange: string) =>
    `cache:ticker:${exchange}:${symbol.toUpperCase()}`,

  tickerAll: (exchange: string) =>
    `cache:tickers:${exchange}:*`,

  fearGreed: () => 'cache:fear_greed:latest',

  prediction: (symbol: string, horizon: string) =>
    `cache:prediction:${symbol.toUpperCase()}:${horizon}`,

  whaleAddressSet: (chain: string) =>
    `whale:addresses:${chain}`,

  alertDedup: (alertType: string, key: string) =>
    `dedup:alert:${alertType}:${key}`,

  rateLimit: (ip: string) =>
    `rate_limit:${ip}`,
} as const;

// ─── Helpers (Modified for Local Set) ────────────────────────────────────────

export async function isWhaleAddress(
  _redis: any,
  address: string,
  chain: string,
): Promise<boolean> {
  return sets.get(redisKey.whaleAddressSet(chain))?.has(address.toLowerCase()) ?? false;
}

export async function addWhaleAddress(
  _redis: any,
  address: string,
  chain: string,
): Promise<void> {
  const key = redisKey.whaleAddressSet(chain);
  let s = sets.get(key);
  if (!s) { s = new Set(); sets.set(key, s); }
  s.add(address.toLowerCase());
}

export async function removeWhaleAddress(
  _redis: any,
  address: string,
  chain: string,
): Promise<void> {
  sets.get(redisKey.whaleAddressSet(chain))?.delete(address.toLowerCase());
}

export async function syncWhaleAddressSet(
  _redis: any,
  addresses: Array<{ address: string; chain: string }>,
): Promise<void> {
  if (addresses.length === 0) return;
  const byChain = new Map<string, Set<string>>();
  for (const { address, chain } of addresses) {
    const s = byChain.get(chain) ?? new Set();
    s.add(address.toLowerCase());
    byChain.set(chain, s);
  }

  for (const [chain, addrs] of byChain) {
    sets.set(redisKey.whaleAddressSet(chain), addrs);
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  type: string;
}> {
  return { connected: true, type: 'in-memory' };
}

export async function closeRedis(): Promise<void> {
  cache.flushAll();
  sets.clear();
  eventEmitter.removeAllListeners();
}
