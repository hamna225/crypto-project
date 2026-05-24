import type { FastifyInstance } from 'fastify';
import { run, query } from '../db/client.js';
import { whaleTracker } from '../services/whale-tracker.service.js';

export async function whalesRoutes(app: FastifyInstance): Promise<void> {

  app.get('/whales/wallets', async (req, reply) => {
    try {
      const wallets = await query('SELECT * FROM whale_wallets ORDER BY added_at DESC');
      await reply.send({ success: true, data: wallets });
    } catch (err) {
      await reply.status(500).send({ success: false, error: 'Database fetch failed' });
    }
  });

  app.post('/whales/wallets', async (req, reply) => {
    const { address, alias } = req.body as { address: string; alias?: string };

    if (!address) return reply.status(400).send({ success: false, error: 'Target 0x address is required' });

    try {
      await run(
        `INSERT OR IGNORE INTO whale_wallets (address, chain, alias, label) VALUES (?, ?, ?, ?)`,
        [address, 'ethereum', alias || 'Custom Target', 'tracked']
      );

      // Force hot-reload of tracked wallets list
      whaleTracker.stop();
      setTimeout(() => whaleTracker.start(), 100);

      await reply.send({ success: true, message: `Target ${address} acquired and tracking started.` });
    } catch (err) {
      await reply.status(500).send({ success: false, error: 'Failed to inject target sequence' });
    }
  });
}
