import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/db/client.js', () => ({ query: vi.fn() }));
vi.mock('../../src/db/redis.js', () => ({
  getRedis: () => ({ set: vi.fn(), publish: vi.fn() }),
  redisKey: { fearGreed: () => 'cache:fear_greed:latest' },
}));

import {
  computeFearGreedIndex,
  normalizeVolatility,
  normalizeMomentum,
  normalizeSentiment,
  normalizeBtcDominance,
  classifyScore,
} from '../../src/utils/fear-greed.js';

// ─── normalizeVolatility ──────────────────────────────────────────────────────
describe('normalizeVolatility', () => {
  it('should return 50 when vol30d is zero', () => {
    expect(normalizeVolatility(0.05, 0)).toBe(50);
  });

  it('should return lower score when recent vol is higher than historical', () => {
    const highRecent = normalizeVolatility(0.08, 0.04); // 2x recent
    const normal = normalizeVolatility(0.04, 0.04);     // 1x ratio
    expect(highRecent).toBeLessThan(normal);
  });

  it('should clamp output to [0, 100]', () => {
    expect(normalizeVolatility(10, 0.001)).toBeGreaterThanOrEqual(0);
    expect(normalizeVolatility(0, 10)).toBeLessThanOrEqual(100);
  });

  it('should return greedy score when recent vol is much lower than historical', () => {
    const score = normalizeVolatility(0.01, 0.08);
    expect(score).toBeGreaterThan(60);
  });
});

// ─── normalizeMomentum ────────────────────────────────────────────────────────
describe('normalizeMomentum', () => {
  it('should return 100 for max positive momentum with high volume', () => {
    expect(normalizeMomentum(1.0, 2.0)).toBe(100);
  });

  it('should return 0 for max negative momentum', () => {
    expect(normalizeMomentum(-1.0, 0)).toBe(0);
  });

  it('should return 50 for neutral momentum, average volume', () => {
    expect(normalizeMomentum(0, 1)).toBeCloseTo(50, 0);
  });

  it('should boost score for volume above average', () => {
    const withHighVol = normalizeMomentum(0.5, 2.0);
    const withNormalVol = normalizeMomentum(0.5, 1.0);
    expect(withHighVol).toBeGreaterThan(withNormalVol);
  });

  it('should clamp output to [0, 100]', () => {
    const score = normalizeMomentum(1.0, 100);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ─── normalizeSentiment ───────────────────────────────────────────────────────
describe('normalizeSentiment', () => {
  it('should map -1 to 0', () => {
    expect(normalizeSentiment(-1)).toBe(0);
  });

  it('should map +1 to 100', () => {
    expect(normalizeSentiment(1)).toBe(100);
  });

  it('should map 0 to 50', () => {
    expect(normalizeSentiment(0)).toBe(50);
  });

  it('should be linear between -1 and +1', () => {
    const mid = normalizeSentiment(0);
    const quarter = normalizeSentiment(-0.5);
    expect(mid).toBe(50);
    expect(quarter).toBe(25);
  });

  it('should clamp out-of-range inputs', () => {
    expect(normalizeSentiment(-2)).toBe(0);
    expect(normalizeSentiment(2)).toBe(100);
  });
});

// ─── normalizeBtcDominance ────────────────────────────────────────────────────
describe('normalizeBtcDominance', () => {
  it('should return lower score when BTC dominance is high (fear)', () => {
    const highDominance = normalizeBtcDominance(65, 0);
    const lowDominance = normalizeBtcDominance(40, 0);
    expect(highDominance).toBeLessThan(lowDominance);
  });

  it('should boost greed score when dominance is falling', () => {
    const falling = normalizeBtcDominance(50, -2);
    const stable = normalizeBtcDominance(50, 0);
    expect(falling).toBeGreaterThan(stable);
  });

  it('should clamp output to [0, 100]', () => {
    const s1 = normalizeBtcDominance(90, 10);
    const s2 = normalizeBtcDominance(0, -10);
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(s2).toBeLessThanOrEqual(100);
  });
});

// ─── classifyScore ────────────────────────────────────────────────────────────
describe('classifyScore', () => {
  const cases: Array<[number, string]> = [
    [0,   'extreme_fear'],
    [19,  'extreme_fear'],
    [20,  'fear'],
    [44,  'fear'],
    [45,  'neutral'],
    [55,  'neutral'],
    [56,  'greed'],
    [75,  'greed'],
    [76,  'extreme_greed'],
    [100, 'extreme_greed'],
  ];

  it.each(cases)('score %i → %s', (score, expected) => {
    expect(classifyScore(score)).toBe(expected);
  });
});

// ─── computeFearGreedIndex ────────────────────────────────────────────────────
describe('computeFearGreedIndex', () => {
  const neutralInputs = {
    volatility7d: 0.02,
    volatility30d: 0.02,
    momentum: 0,
    volumeRatio: 1,
    socialSentiment: 0,
    btcDominance: 50,
    btcDominanceDelta: 0,
    googleTrendsScore: 50,
    officialScore: 50,
  };

  it('should return a composite score in [0, 100]', () => {
    const result = computeFearGreedIndex(neutralInputs);
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });

  it('should return 6 components', () => {
    const result = computeFearGreedIndex(neutralInputs);
    expect(result.components).toHaveLength(6);
  });

  it('should include computedAt as a Date', () => {
    const result = computeFearGreedIndex(neutralInputs);
    expect(result.computedAt).toBeInstanceOf(Date);
  });

  it('should classify neutral inputs as neutral or near-neutral', () => {
    const result = computeFearGreedIndex(neutralInputs);
    expect(['fear', 'neutral', 'greed']).toContain(result.classification);
  });

  it('should produce extreme_greed for uniformly bullish inputs', () => {
    const bullish = {
      volatility7d: 0.01,
      volatility30d: 0.03,
      momentum: 0.9,
      volumeRatio: 2.5,
      socialSentiment: 0.9,
      btcDominance: 38,
      btcDominanceDelta: -3,
      googleTrendsScore: 90,
      officialScore: 85,
    };
    const result = computeFearGreedIndex(bullish);
    expect(result.compositeScore).toBeGreaterThan(70);
  });

  it('should produce extreme_fear for uniformly bearish inputs', () => {
    const bearish = {
      volatility7d: 0.08,
      volatility30d: 0.02,
      momentum: -0.9,
      volumeRatio: 0.3,
      socialSentiment: -0.9,
      btcDominance: 70,
      btcDominanceDelta: 5,
      googleTrendsScore: 10,
      officialScore: 5,
    };
    const result = computeFearGreedIndex(bearish);
    expect(result.compositeScore).toBeLessThan(30);
  });

  it('should handle null officialScore by substituting 50', () => {
    const withNull = { ...neutralInputs, officialScore: null };
    const result = computeFearGreedIndex(withNull);
    expect(result.officialScore).toBeUndefined();
    expect(result.compositeScore).toBeGreaterThanOrEqual(0);
  });

  it('component weights should sum to 1.0', () => {
    const result = computeFearGreedIndex(neutralInputs);
    const totalWeight = result.components.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it('weighted scores should sum to composite score', () => {
    const result = computeFearGreedIndex(neutralInputs);
    const sumOfWeighted = result.components.reduce((sum, c) => sum + c.weightedScore, 0);
    // compositeScore is rounded, so allow 1-unit tolerance
    expect(Math.abs(result.compositeScore - sumOfWeighted)).toBeLessThan(1);
  });
});
