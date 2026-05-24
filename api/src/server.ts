import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { globalErrorHandler } from './middleware/error-handler.js';
import { healthRoutes } from './routes/health.route.js';
import { tickerRoutes } from './routes/tickers.route.js';
import { alertRoutes } from './routes/alerts.route.js';
import { fearGreedRoutes } from './routes/fear-greed.route.js';
import { predictionsRoutes } from './routes/predictions.route.js';
import { CoinbaseService } from './services/coinbase.service.js';
import { CoinGeckoService } from './services/coingecko.service.js';
import { whaleTracker } from './services/whale-tracker.service.js';
import { alertEngine } from './services/alert-engine.service.js';
import { predictionService } from './services/prediction.service.js';
import { getDB, closePool } from './db/client.js';
import { getRedis, closeRedis } from './db/redis.js';

// ─── Server Bootstrap ─────────────────────────────────────────────────────────

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  trustProxy: true,
  ajv: { customOptions: { strict: false } },
});

async function bootstrap(): Promise<void> {
  // ── Plugins ────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  await app.register(websocket);

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    }),
  });

  // ── Error Handler ──────────────────────────────────────────────────────────
  app.setErrorHandler(globalErrorHandler);

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(healthRoutes);            // → /health
  await app.register(tickerRoutes, { prefix: '/api' });
  await app.register(alertRoutes, { prefix: '/api' });
  await app.register(fearGreedRoutes, { prefix: '/api' });
  await app.register(predictionsRoutes, { prefix: '/api' });
  
  // Dynamic imports for optional routes
  const analysisRoute = await import('./routes/analysis.route.js');
  const whalesRoute = await import('./routes/whales.route.js');
  const configRoute = await import('./routes/config.route.js');
  
  await app.register(analysisRoute.analysisRoutes, { prefix: '/api' });
  await app.register(whalesRoute.whalesRoutes, { prefix: '/api' });
  await app.register(configRoute.configRoutes, { prefix: '/api' });

  // ── WebSocket — Real-time ticker stream ────────────────────────────────────
  app.register(async function wsRoutes(wsApp) {
    wsApp.get('/ws/tickers', { websocket: true }, (socket) => {
      const redis = getRedis();
      const subscriber = redis.duplicate();

      void subscriber.subscribe('stream:price:tick');

      subscriber.on('message', (_ch: string, msg: string) => {
        try {
          (socket as any).write(msg);
        } catch (e) {
          // Socket is closed or not ready
        }
      });

      socket.on('close', () => {
        subscriber.disconnect();
      });
    });

    wsApp.get('/ws/whales', { websocket: true }, (socket) => {
      const redis = getRedis();
      const subscriber = redis.duplicate();

      void subscriber.subscribe('stream:whale:detected');

      subscriber.on('message', (_ch: string, msg: string) => {
        try {
          (socket as any).write(msg);
        } catch (e) {
          // Socket is closed or not ready
        }
      });

      socket.on('close', () => {
        subscriber.disconnect();
      });
    });
  });

  // ── Background Services ────────────────────────────────────────────────────
  const coinbaseService = new CoinbaseService([
    'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD',
    'ADA-USD', 'AVAX-USD', 'MATIC-USD', 'LINK-USD', 'DOT-USD',
  ]);

  const coinGeckoService = new CoinGeckoService();

  // Wire up Coinbase ticker → Redis Pub/Sub for WebSocket broadcast
  coinbaseService.on('ticker', (ticker) => {
    void getRedis().publish('stream:price:tick', JSON.stringify(ticker));
  });

  coinbaseService.on('error', (err) => {
    app.log.error({ err }, 'Coinbase WS error');
  });

  // Wire up whale detection → Redis stream for WebSocket broadcast
  whaleTracker.on('whaleTx', (tx) => {
    void getRedis().publish('stream:whale:detected', JSON.stringify(tx));
  });

  // Start services
  coinbaseService.connect();
  coinGeckoService.startPolling();
  predictionService.start();
  await alertEngine.start();

  // Whale tracker is optional — only starts if Alchemy key is set
  void whaleTracker.start();

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal} — shutting down gracefully`);
    coinbaseService.disconnect();
    coinGeckoService.stopPolling();
    predictionService.stop();
    whaleTracker.stop();
    await app.close();
    await closePool();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // ── Listen ─────────────────────────────────────────────────────────────────
  const address = await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info(`⚡ DARK SIDE CRYPTO API on ${address}`);
  app.log.info(`📊 Mode: ${config.NODE_ENV}`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export { app };
