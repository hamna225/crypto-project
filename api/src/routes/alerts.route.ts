import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { getRedis } from '../db/redis.js';
import { AppError } from '../middleware/error-handler.js';

export async function alertRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/alerts ───────────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string; type?: string } }>(
    '/alerts',
    async (req, reply) => {
      const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 500);
      const type = req.query.type;

      try {
        const result = await query<any>(
          type
            ? `SELECT * FROM alerts WHERE type = ? ORDER BY created_at DESC LIMIT ?`
            : `SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?`,
          type ? [type, limit] : [limit],
        );
        await reply.send({ success: true, data: result, meta: { total: result.length, timestamp: new Date().toISOString() } });
      } catch (_) {
        await reply.send({ success: true, data: [], meta: { total: 0, timestamp: new Date().toISOString() } });
      }
    },
  );

  // ── GET /api/alerts/stats ─────────────────────────────────────────────────
  app.get('/alerts/stats', async (_req, reply) => {
    try {
      const result = await query<any>(`
        SELECT
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed,
          COUNT(*) AS total
        FROM alerts
        WHERE created_at > datetime('now', '-24 hours')
      `);
      await reply.send({ success: true, data: result[0] ?? {} });
    } catch (_) {
      await reply.send({ success: true, data: {} });
    }
  });

  // ── POST /api/alerts/test ─────────────────────────────────────────────────
  app.post('/alerts/test', async (_req, reply) => {
    try {
      const redis = getRedis();
      const testAlert = {
        type: 'price_spike',
        severity: 'low',
        title: '🧪 Test Alert',
        body: 'This is a test alert fired via the API.',
        metadata: {},
        channels: ['webhook'],
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      await redis.publish('alerts:dispatch', JSON.stringify(testAlert));
      await reply.send({ success: true, data: { message: 'Test alert dispatched', alert: testAlert } });
    } catch (_) {
      throw new AppError(503, 'CACHE_UNAVAILABLE', 'Local cache unavailable — cannot dispatch alert');
    }
  });
}
