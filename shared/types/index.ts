// ─── SHARED TYPE CONTRACTS ────────────────────────────────────────────────────
// All services import from here. Never duplicate type definitions across layers.

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
export type Chain = 'ethereum' | 'bsc' | 'solana' | 'bitcoin' | 'polygon';
export type WalletDirection = 'buy' | 'sell' | 'transfer';
export type WalletLabel = 'exchange' | 'whale' | 'unknown' | 'defi' | 'miner';
export type SentimentPolarity = 'positive' | 'negative' | 'neutral';
export type SentimentSource = 'twitter' | 'reddit' | 'telegram' | 'news';
export type FearGreedClassification = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
export type AlertType = 'whale_buy' | 'whale_sell' | 'whale_transfer' | 'price_spike' | 'price_crash' | 'sentiment_flip' | 'extreme_fear' | 'extreme_greed' | 'prediction_signal' | 'liquidation_spike';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlertStatus = 'pending' | 'delivered' | 'failed' | 'suppressed';
export type AlertChannel = 'telegram' | 'email' | 'sms' | 'push' | 'webhook';
export type PredictionDirection = 'UP' | 'DOWN' | 'SIDEWAYS';
export type PredictionHorizon = '1h' | '4h' | '24h';
export type TrendStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export interface OHLCVCandle {
  symbol: string;
  exchange: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  interval: CandleInterval;
}

export interface Ticker {
  symbol: string;
  exchange: string;
  price: number;
  priceChange24h: number;
  priceChangePct24h: number;
  volume24h: number;
  marketCap?: number;
  updatedAt: Date;
}

export interface WhaleWallet {
  id: string;
  address: string;
  chain: Chain;
  alias?: string;
  label: WalletLabel;
  watchedSince: Date;
  isActive: boolean;
}

export interface WhaleTransaction {
  txHash: string;
  chain: Chain;
  fromAddress: string;
  toAddress: string;
  fromAlias?: string;
  toAlias?: string;
  token: string;
  tokenAddress?: string;
  amountRaw: string;
  amountUsd: number;
  direction: WalletDirection;
  blockNumber: number;
  timestamp: Date;
  isPending: boolean;
}

export interface SentimentScore {
  id: string;
  source: SentimentSource;
  symbol?: string;
  score: number;
  polarity: SentimentPolarity;
  confidence: number;
  rawText?: string;
  url?: string;
  authorId?: string;
  createdAt: Date;
  processedAt: Date;
}

export interface FearGreedComponent {
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
}

export interface FearGreedIndex {
  compositeScore: number;
  classification: FearGreedClassification;
  components: FearGreedComponent[];
  computedAt: Date;
  officialScore?: number;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  channels: AlertChannel[];
  status: AlertStatus;
  createdAt: Date;
  deliveredAt?: Date;
}

export interface PricePrediction {
  id: string;
  symbol: string;
  horizon: PredictionHorizon;
  direction: PredictionDirection;
  confidence: number;
  priceLow: number;
  priceHigh: number;
  trendStrength: TrendStrength;
  modelVersion: string;
  generatedAt: Date;
}

export const REDIS_CHANNELS = {
  PRICE_TICK: 'stream:price:tick',
  WHALE_DETECTED: 'stream:whale:detected',
  LIQUIDATION: 'stream:liquidation:binance',
  SENTIMENT_SCORED: 'stream:sentiment:scored',
  FEAR_GREED_UPDATED: 'stream:fear_greed:updated',
  ALERT_DISPATCH: 'alerts:dispatch',
  ALERT_WHALE: 'alerts:whale',
  ALERT_PRICE: 'alerts:price',
  ALERT_SENTIMENT: 'alerts:sentiment',
} as const;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  meta?: { page?: number; limit?: number; total?: number; timestamp: string };
}
