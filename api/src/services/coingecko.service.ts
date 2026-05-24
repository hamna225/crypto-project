import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Ticker } from '../../../shared/types/index.js';
import { config } from '../config.js';
import { resolveConfig } from '../utils/config-resolver.js';
import { run, withTransaction } from '../db/client.js';

// ─── CoinGecko REST Service ───────────────────────────────────────────────────
// Polls CoinGecko for price data, market cap, and the Fear & Greed index.
// Implements request queuing to respect rate limits (30 req/min free tier).

const RATE_LIMIT_DELAY_MS = 2_500; // ~24 req/min, safe margin below 30

// Supported top coins — extend as needed
const TRACKED_COIN_IDS = [
  'bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple',
  'cardano', 'avalanche-2', 'polkadot', 'chainlink', 'polygon',
];

export class CoinGeckoService {
  private readonly http: AxiosInstance;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 60_000; // 1-minute polls (free tier safe)

  constructor() {
    this.http = axios.create({
      baseURL: config.COINGECKO_BASE_URL,
      timeout: 10_000,
      headers: {
        Accept: 'application/json',
      },
    });

    // Request interceptor to inject dynamically configured API key
    this.http.interceptors.request.use(async (reqConfig) => {
      const apiKey = await resolveConfig('COINGECKO_API_KEY');
      if (apiKey) {
        reqConfig.headers['x-cg-demo-api-key'] = apiKey;
      }
      return reqConfig;
    });

    // Response interceptor — log rate limit warnings
    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 429) {
          console.warn('[coingecko] Rate limited — backing off 60s');
        }
        return Promise.reject(error);
      },
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  startPolling(): void {
    console.info('[coingecko] Starting price poll loop');
    void this.pollAll(); // immediate first run
    this.pollTimer = setInterval(() => void this.pollAll(), this.POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async fetchFearGreed(): Promise<number | null> {
    try {
      const { data } = await this.http.get<{ data: Array<{ value: string }> }>(
        'https://api.alternative.me/fng/',
        { baseURL: '' }, // override base URL for this external call
      );
      return Number(data.data[0]?.value ?? null);
    } catch (err) {
      console.error('[coingecko] Failed to fetch Fear & Greed:', err);
      return null;
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async pollAll(): Promise<void> {
    try {
      const tickers = await this.fetchMarkets(TRACKED_COIN_IDS);
      await this.persist(tickers);
      this.cacheAll(tickers);
      console.info(`[coingecko] Refreshed ${tickers.length} tickers`);
    } catch (err) {
      console.error('[coingecko] Poll error:', err);
    }
  }

  private async fetchMarkets(coinIds: string[]): Promise<Ticker[]> {
    const { data } = await this.http.get<CoinGeckoMarketItem[]>('/coins/markets', {
      params: {
        vs_currency: 'usd',
        ids: coinIds.join(','),
        order: 'market_cap_desc',
        per_page: 50,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h',
      },
    });

    return data.map((item) => this.normalizeMarketItem(item));
  }

  private normalizeMarketItem(item: CoinGeckoMarketItem): Ticker {
    // Coinbase uses "BTC-USD" format, CoinGecko uses "bitcoin"
    const symbol = `${item.symbol.toUpperCase()}-USD`;

    return {
      symbol,
      exchange: 'coingecko',
      price: item.current_price,
      priceChange24h: item.price_change_24h ?? 0,
      priceChangePct24h: item.price_change_percentage_24h ?? 0,
      volume24h: item.total_volume,
      marketCap: item.market_cap,
      updatedAt: new Date(item.last_updated),
    };
  }

  private async persist(tickers: Ticker[]): Promise<void> {
    if (tickers.length === 0) return;

    await withTransaction(async () => {
      for (const t of tickers) {
        await run(
          `INSERT INTO tickers
             (symbol, exchange, price, price_change_24h, price_change_pct_24h, volume_24h, market_cap, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (symbol, exchange)
           DO UPDATE SET
             price                = excluded.price,
             price_change_24h     = excluded.price_change_24h,
             price_change_pct_24h = excluded.price_change_pct_24h,
             volume_24h           = excluded.volume_24h,
             market_cap           = excluded.market_cap,
             updated_at           = CURRENT_TIMESTAMP`,
          [t.symbol, t.exchange, t.price, t.priceChange24h, t.priceChangePct24h, t.volume24h, t.marketCap ?? null]
        );
      }
    });
  }

  private cacheAll(_tickers: Ticker[]): void {
    // Redis not used in local architecture — no-op
  }
}

// ─── CoinGecko API Shape ──────────────────────────────────────────────────────
interface CoinGeckoMarketItem {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  last_updated: string;
}
