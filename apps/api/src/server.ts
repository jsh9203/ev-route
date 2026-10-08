import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RecommendRequestSchema, VEHICLE_PRESETS, type ApiError } from '@ev-route/shared';
import { BadRequestError, recommend, type EngineDeps } from './recommend/engine';
import { eligibleChargers } from './recommend/evaluate';
import { UpstreamError } from './tmap/client';

export function buildServer(deps: EngineDeps & { tmapWebAppKey: string }): FastifyInstance {
  const app = Fastify({ logger: { level: 'info' } });

  app.setErrorHandler((err, _req, reply) => {
    const send = (status: number, body: ApiError) => reply.status(status).send(body);
    if (err instanceof z.ZodError) return send(400, { code: 'BAD_REQUEST', message: z.prettifyError(err) });
    if (err instanceof BadRequestError) return send(400, { code: 'BAD_REQUEST', message: err.message });
    if (err instanceof UpstreamError) return send(502, { code: err.code, message: err.message });
    app.log.error(err);
    return send(500, { code: 'INTERNAL', message: '서버 오류가 발생했습니다' });
  });

  app.get('/api/v1/health', async () => ({ ok: true, stations: deps.index.size }));

  // 브라우저 지도 SDK 용 런타임 설정 (빌드에 키를 넣지 않기 위함)
  app.get('/api/v1/config', async () => ({ tmapWebAppKey: deps.tmapWebAppKey }));

  app.get('/api/v1/vehicles/presets', async () => VEHICLE_PRESETS);

  app.get('/api/v1/places/search', async (req) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    return deps.tmap.searchPlaces(q);
  });

  app.get('/api/v1/stations/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const station = deps.index.get(id);
    if (!station) return reply.status(404).send({ code: 'NOT_FOUND', message: '충전소를 찾을 수 없습니다' } satisfies ApiError);
    const statuses = station.source === 'evcs' ? (await deps.status.get([id])).get(id) ?? null : null;
    const preset = VEHICLE_PRESETS[0]!;
    return { ...station, compatibleChargers: eligibleChargers(station, preset, 0).length, statuses };
  });

  app.post('/api/v1/routes/recommend', async (req) => recommend(RecommendRequestSchema.parse(req.body), deps));

  return app;
}
