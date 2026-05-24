import { z } from 'zod';
import 'dotenv/config';

// ─── Environment Schema ───────────────────────────────────────────────────────
// All config is validated at startup. Missing required vars crash immediately
// with a clear error rather than silently using undefined at runtime.

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  JWT_SECRET: z.string().min(32).default('dev-secret-32-chars-minimum-length!!'),

  // Database
  DB_TYPE: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DB_PATH: z.string().default('./data/crypto_intelligence.sqlite'),
  PG_HOST: z.string().default('127.0.0.1'),
  PG_PORT: z.coerce.number().int().default(5432),
  PG_USER: z.string().default('postgres'),
  PG_PASSWORD: z.string().default('postgres'),
  PG_DATABASE: z.string().default('crypto_intelligence'),

  // Exchanges
  COINBASE_API_KEY: z.string().optional(),
  COINBASE_API_SECRET: z.string().optional(),
  COINBASE_WS_URL: z.string().url().default('wss://advanced-trade-ws.coinbase.com'),
  BINANCE_API_KEY: z.string().optional(),
    // Binance Futures: enable optional public liquidation (forceOrder) stream
    BINANCE_FUTURES_ENABLED: z.coerce.boolean().default(false),
    BINANCE_FUTURES_SYMBOLS: z.string().default('btcusdt'),
    BINANCE_FUTURES_COMBINED: z.coerce.boolean().default(true),
  BINANCE_WS_URL: z.string().url().default('wss://stream.binance.com:9443'),
  COINGECKO_API_KEY: z.string().optional(),
  COINGECKO_BASE_URL: z.string().url().default('https://api.coingecko.com/api/v3'),

  // Blockchain RPCs
  ALCHEMY_PROJECT_ID: z.string().optional(),
  QUICKNODE_BSC_URL: z.string().url().optional(),

  // Alert Channels
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  ALERT_EMAIL_FROM: z.string().email().default('noreply@cryptointelligence.local'),
  ALERT_EMAIL_TO: z.string().email().default('alerts@cryptointelligence.local'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_FROM: z.string().optional(),
  TWILIO_PHONE_TO: z.string().optional(),
  ALERT_WEBHOOK_URL: z.string().url().optional(),

  // ML Service
  ML_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),

  // Thresholds
  WHALE_BUY_THRESHOLD_USD: z.coerce.number().default(500_000),
  WHALE_SELL_THRESHOLD_USD: z.coerce.number().default(500_000),
  WHALE_TRANSFER_THRESHOLD_USD: z.coerce.number().default(1_000_000),
  PRICE_SPIKE_PCT: z.coerce.number().default(5),
  PRICE_SPIKE_WINDOW_MIN: z.coerce.number().default(15),
  PRICE_CRASH_PCT: z.coerce.number().default(7),
});

// Parse & freeze — this throws at startup if validation fails
const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
export type Config = typeof config;
