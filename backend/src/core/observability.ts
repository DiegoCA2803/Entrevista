import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Registry, Histogram, Counter, Gauge, collectDefaultMetrics } from 'prom-client';
import type { RequestHandler } from 'express';
import type { AppRepositories } from '../repositories/db.js';
import { OutboxService } from '../services/outbox.service.js';
import { asyncHandler } from './middleware/error.middleware.js';

export function secretMatches(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createObservability(repos: AppRepositories, outbox: OutboxService) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'minefleet_' });
  const requests = new Counter({
    name: 'minefleet_http_requests_total',
    help: 'HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry]
  });
  const latency = new Histogram({
    name: 'minefleet_http_duration_seconds',
    help: 'HTTP duration',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [registry]
  });
  const queue = new Gauge({
    name: 'minefleet_outbox_events',
    help: 'Persisted events by delivery status',
    labelNames: ['status'],
    registers: [registry]
  });
  const fleet = new Gauge({
    name: 'minefleet_equipment',
    help: 'Fleet by status',
    labelNames: ['status'],
    registers: [registry]
  });
  const database = new Gauge({
    name: 'minefleet_database_up',
    help: 'Database readiness',
    registers: [registry]
  });
  const middleware: RequestHandler = (req, res, next) => {
    const isApi = req.originalUrl.startsWith('/api');
    res.locals.requestId = randomUUID();
    res.set('X-Request-Id', res.locals.requestId);
    const start = performance.now();
    res.on('finish', () => {
      const route = req.route?.path
        ? `${isApi && !req.route.path.startsWith('/api') ? '/api' : ''}${req.route.path}`
        : 'unmatched';
      const elapsed = (performance.now() - start) / 1000;
      requests.inc({ method: req.method, route, status: res.statusCode });
      latency.observe({ method: req.method, route }, elapsed);
      if (isApi && route !== '/api/health')
        console.log(
          JSON.stringify({
            event: 'http_request',
            request_id: res.locals.requestId,
            method: req.method,
            route,
            status: res.statusCode,
            duration_ms: Math.round(elapsed * 1000),
            actor: res.locals.user?.id
          })
        );
    });
    next();
  };
  const metrics = asyncHandler(async (req, res) => {
    if (
      !secretMatches(req.get('Authorization'), `Bearer ${process.env.METRICS_TOKEN || ''}`) ||
      !process.env.METRICS_TOKEN
    )
      return res.sendStatus(401);
    try {
      const [status, equipment] = await Promise.all([outbox.status(), repos.equipmentRepo.findAll()]);
      database.set(1);
      for (const [key, value] of Object.entries(status.counts)) queue.set({ status: key }, Number(value));
      for (const state of ['DISPONIBLE', 'BLOQUEADO', 'EN_MANTENIMIENTO'])
        fleet.set({ status: state }, equipment.filter((e) => e.status === state).length);
    } catch {
      database.set(0);
    }
    res.type(registry.contentType).send(await registry.metrics());
  });
  return { middleware, metrics, registry };
}
