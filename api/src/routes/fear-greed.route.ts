import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { getRedis, redisKey } from '../db/redis.js';
import { AppError } from '../middleware/error-handler.js';
import type { FearGreedIndex } from '../../../shared/types/index.js';

export async function fearGreedRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/fear-greed/latest — Current F&G index ────────────────────────
  app.get('/fear-greed/latest', async (_req, reply) => {
    try {
      const redis = getRedis();

      // Try local cache first
      try {
        const cached = await redis.get(redisKey.fearGreed());
        if (cached) {
          await reply.send({
            success: true,
            data: JSON.parse(cached),
          });
          return;
        }
      } catch (_err) {
        /* cache unavailable */
      }

      // Fall back to latest from DB
      const result = await query<any>(
        `SELECT composite_score, classification, components, official_score, computed_at
         FROM fear_greed_index
         ORDER BY computed_at DESC
         LIMIT 1`,
      );

      if (!result.length) {
        // No data yet — return neutral placeholder
        const placeholder: FearGreedIndex = {
          compositeScore: 50,
          classification: 'neutral',
          components: [],
          computedAt: new Date(),
          officialScore: undefined,
        };
        await reply.send({ success: true, data: placeholder });
        return;
      }

      const row = result[0];
      const data: FearGreedIndex = {
        compositeScore: row.composite_score,
        classification: row.classification,
        components: row.components ? JSON.parse(row.components) : [],
        computedAt: row.computed_at,
        officialScore: row.official_score ?? undefined,
      };

      await reply.send({ success: true, data });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, 'DB_UNAVAILABLE', 'Database unavailable');
    }
  });

  // ── GET /api/fear-greed/history — 30-day history ──────────────────────────
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/fear-greed/history',
    async (req, reply) => {
      try {
        const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 1000);
        const offset = parseInt(req.query.offset ?? '0', 10);

        const result = await query<any>(
          `SELECT composite_score, classification, components, official_score, computed_at
           FROM fear_greed_index
           WHERE computed_at >= datetime('now', '-30 days')
           ORDER BY computed_at DESC
           LIMIT ? OFFSET ?`,
          [limit, offset],
        );

        const data = result.map((row) => ({
          compositeScore: row.composite_score,
          classification: row.classification,
          components: row.components ? JSON.parse(row.components) : [],
          computedAt: row.computed_at,
          officialScore: row.official_score ?? undefined,
        }));

        await reply.send({
          success: true,
          data,
          meta: {
            total: result.length,
            limit,
            offset,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(503, 'DB_UNAVAILABLE', 'Database unavailable');
      }
    },
  );
}
