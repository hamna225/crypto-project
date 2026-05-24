import type { FastifyInstance } from 'fastify';
import { checkDatabaseHealth } from '../db/client.js';
import { checkRedisHealth } from '../db/redis.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // ── Liveness ─────────────────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    await reply.send({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  // ── Readiness — checks DB + Cache ─────────────────────────────────────────
  app.get('/health/ready', async (_req, reply) => {
    const [db, cache] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const ready = db.connected && cache.connected;

    await reply.status(ready ? 200 : 503).send({
      success: ready,
      data: {
        status: ready ? 'ready' : 'degraded',
        checks: { 
          database: { connected: db.connected, type: db.type },
          cache: { connected: cache.connected, type: cache.type }
        },
        timestamp: new Date().toISOString(),
      },
    });
  });
}
