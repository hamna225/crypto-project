import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db/client.js';
import { whaleTracker } from '../services/whale-tracker.service.js';
import { alertEngine } from '../services/alert-engine.service.js';
import { config } from '../config.js';

export async function configRoutes(app: FastifyInstance): Promise<void> {
  // ── Get Configuration Status ──────────────────────────────────────────────
  // Returns which keys are set (either via ENV or DB)
  app.get('/config/status', async (_req, reply) => {
    const requiredKeys = [
      { id: 'ALCHEMY_PROJECT_ID', name: 'Alchemy (Whales)', required: true },
      { id: 'BINANCE_API_KEY', name: 'Binance API Key', required: false },
      { id: 'BINANCE_API_SECRET', name: 'Binance API Secret', required: false },
      { id: 'ML_SERVICE_URL', name: 'ML API URL', required: true },
      { id: 'COINBASE_API_KEY', name: 'Coinbase API Key', required: false },
      { id: 'COINBASE_API_SECRET', name: 'Coinbase API Secret', required: false },
      { id: 'COINGECKO_API_KEY', name: 'CoinGecko API Key', required: false },
      { id: 'TELEGRAM_BOT_TOKEN', name: 'Telegram Bot Token', required: false },
      { id: 'TELEGRAM_CHAT_ID', name: 'Telegram Chat ID', required: false },
    ];

    const status = await Promise.all(requiredKeys.map(async k => {
      const dbValue = await getSetting(k.id);
      const value = dbValue || (config as any)[k.id];
      return {
        ...k,
        isSet: !!value,
        source: dbValue ? 'database' : value ? 'env' : 'none'
      };
    }));

    await reply.send({ success: true, data: { status } });
  });

  // ── Update Configuration ──────────────────────────────────────────────────
  app.post('/config', async (req, reply) => {
    const { keys } = req.body as { keys: Record<string, string> };

    if (!keys || typeof keys !== 'object') {
      return reply.status(400).send({ success: false, error: 'Invalid payload' });
    }

    try {
      let requiresWhaleTrackerRestart = false;
      let requiresAlertEngineRestart = false;

      for (const [key, value] of Object.entries(keys)) {
        if (value) {
          await setSetting(key, value);
          if (key === 'ALCHEMY_PROJECT_ID') {
            requiresWhaleTrackerRestart = true;
          }
          if (key === 'TELEGRAM_BOT_TOKEN' || key === 'TELEGRAM_CHAT_ID') {
            requiresAlertEngineRestart = true;
          }
        }
      }

      if (requiresWhaleTrackerRestart) {
        app.log.info('[config] Alchemy Project ID updated. Restarting Whale Tracker...');
        whaleTracker.stop();
        // Fire asynchronously to avoid blocking the response
        Promise.resolve().then(() => whaleTracker.start()).catch((err) => {
          app.log.error({ err }, 'Failed to start Whale Tracker after config update');
        });
      }

      if (requiresAlertEngineRestart) {
        app.log.info('[config] Telegram configuration updated. Reloading Alert Dispatcher channels...');
        await alertEngine.reloadChannels();
      }

      await reply.send({ success: true, message: 'Configuration synchronized' });
    } catch (err) {
      app.log.error({ err }, 'Failed to update configuration');
      await reply.status(500).send({ success: false, error: 'Internal Server Error' });
    }
  });
}
