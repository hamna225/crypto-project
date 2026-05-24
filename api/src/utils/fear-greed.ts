import type { FearGreedIndex, FearGreedClassification, FearGreedComponent } from '../../../shared/types/index.js';
import { REDIS_CHANNELS } from '../../../shared/types/index.js';
import { getRedis, redisKey } from '../db/redis.js';
import { query } from '../db/client.js';

// ─── Proprietary Fear & Greed Index ──────────────────────────────────────────
// Computes a composite score from multiple signals with configurable weights.
// Extends the official alternative.me index with real-time exchange data.

interface FearGreedInputs {
  volatility7d: number;         // 7d price volatility (σ of daily returns)
  volatility30d: number;        // 30d price volatility
  momentum: number;             // 30d price momentum (-1 to +1)
  volumeRatio: number;          // current vol / 30d average vol
  socialSentiment: number;      // NLP sentiment score (-1 to +1)
  btcDominance: number;         // BTC dominance % (0-100)
  btcDominanceDelta: number;    // Change in BTC dominance (negative = alt season)
  googleTrendsScore: number;    // Google Trends score (0-100)
  officialScore: number | null; // alternative.me score (0-100)
}

const COMPONENT_WEIGHTS = {
  price_volatility: 0.25,
  market_momentum: 0.25,
  social_sentiment: 0.15,
  btc_dominance: 0.10,
  google_trends: 0.10,
  official_index: 0.15,
} as const;

/**
 * Compute the proprietary Fear & Greed composite score.
 * All inputs are normalized to 0-100 before weighting.
 * Pure function — no side effects, fully testable.
 */
export function computeFearGreedIndex(inputs: FearGreedInputs): FearGreedIndex {
  const components: FearGreedComponent[] = [
    {
      name: 'Price Volatility',
      weight: COMPONENT_WEIGHTS.price_volatility,
      rawScore: normalizeVolatility(inputs.volatility7d, inputs.volatility30d),
      weightedScore: 0,
    },
    {
      name: 'Market Momentum & Volume',
      weight: COMPONENT_WEIGHTS.market_momentum,
      rawScore: normalizeMomentum(inputs.momentum, inputs.volumeRatio),
      weightedScore: 0,
    },
    {
      name: 'Social Media Sentiment',
      weight: COMPONENT_WEIGHTS.social_sentiment,
      rawScore: normalizeSentiment(inputs.socialSentiment),
      weightedScore: 0,
    },
    {
      name: 'BTC Dominance',
      weight: COMPONENT_WEIGHTS.btc_dominance,
      rawScore: normalizeBtcDominance(inputs.btcDominance, inputs.btcDominanceDelta),
      weightedScore: 0,
    },
    {
      name: 'Google Trends',
      weight: COMPONENT_WEIGHTS.google_trends,
      rawScore: clamp(inputs.googleTrendsScore, 0, 100),
      weightedScore: 0,
    },
    {
      name: 'Official F&G Index',
      weight: COMPONENT_WEIGHTS.official_index,
      rawScore: inputs.officialScore !== null ? clamp(inputs.officialScore, 0, 100) : 50,
      weightedScore: 0,
    },
  ];

  // Compute weighted scores
  let compositeScore = 0;
  for (const component of components) {
    component.weightedScore = component.rawScore * component.weight;
    compositeScore += component.weightedScore;
  }

  compositeScore = Math.round(clamp(compositeScore, 0, 100));

  return {
    compositeScore,
    classification: classifyScore(compositeScore),
    components,
    computedAt: new Date(),
    officialScore: inputs.officialScore ?? undefined,
  };
}

/** Persist to DB and cache in Redis. */
export async function persistFearGreedIndex(index: FearGreedIndex): Promise<void> {
  await query(
    `INSERT INTO fear_greed_index (composite_score, classification, components, official_score)
     VALUES (?, ?, ?, ?)`,
    [
      index.compositeScore,
      index.classification,
      JSON.stringify(index.components),
      index.officialScore ?? null,
    ],
  );

  const redis = getRedis();
  await redis.set(
    redisKey.fearGreed(),
    JSON.stringify(index)
  );

  // Notify dashboard subscribers
  await redis.publish(REDIS_CHANNELS.FEAR_GREED_UPDATED, JSON.stringify(index));
}

// ─── Normalization Helpers ────────────────────────────────────────────────────
// All return 0-100. Higher = more greedy. Lower = more fearful.

/**
 * Volatility: high recent vs historical volatility = Fear (low score).
 * When markets are erratic, investors are fearful.
 */
export function normalizeVolatility(vol7d: number, vol30d: number): number {
  if (vol30d === 0) return 50;
  const ratio = vol7d / vol30d;
  // ratio > 1 = higher recent vol = more fear
  // Map: ratio 0 → 100 (greed), ratio 2+ → 0 (fear)
  return clamp(100 - (ratio - 0.5) * 100, 0, 100);
}

/**
 * Momentum: positive price trend + above-average volume = Greed (high score).
 */
export function normalizeMomentum(momentum: number, volumeRatio: number): number {
  // momentum is -1 to +1 → normalize to 0-100
  const momentumScore = (momentum + 1) / 2 * 100;
  // volume ratio above 1 = boosted activity
  const volumeBoost = Math.min((volumeRatio - 1) * 20, 20);
  return clamp(momentumScore + volumeBoost, 0, 100);
}

/**
 * Sentiment: -1 (very negative) → 0, +1 (very positive) → 100.
 */
export function normalizeSentiment(score: number): number {
  return clamp((score + 1) / 2 * 100, 0, 100);
}

/**
 * BTC Dominance: rising dominance = Fear (flight to safety).
 * Falling dominance = altcoin season = Greed.
 */
export function normalizeBtcDominance(dominance: number, delta: number): number {
  // High BTC dominance (60%+) is typically fear
  const dominanceScore = clamp(100 - (dominance - 40) * 2, 0, 100);
  // Falling delta = increasing greed (alts rising)
  const deltaBoost = clamp(-delta * 5, -20, 20);
  return clamp(dominanceScore + deltaBoost, 0, 100);
}

export function classifyScore(score: number): FearGreedClassification {
  if (score < 20) return 'extreme_fear';
  if (score < 45) return 'fear';
  if (score < 56) return 'neutral';
  if (score < 76) return 'greed';
  return 'extreme_greed';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
