import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { bootstrapContainer } from './core/container/bootstrap.js';
import { TOKENS } from './core/container/container.js';
import { ApiController } from './controllers/api.controller.js';
import { AppRepositories } from './repositories/db.js';
import { createApiRouter } from './routes/api.routes.js';
import { seedDatabase } from './seeds/seed.js';
import { errorHandler, asyncHandler } from './core/middleware/error.middleware.js';
import { createAuth } from './core/auth.js';
import { createObservability, secretMatches } from './core/observability.js';
import { createCommandRunner } from './core/command.js';
import { OutboxService } from './services/outbox.service.js';

export async function createApp(customRepos?: AppRepositories) {
  const app = express();
  if (process.env.VERCEL) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'upgrade-insecure-requests': process.env.COOKIE_SECURE === 'false' ? null : []
        }
      }
    })
  );
  app.use(express.json({ limit: '128kb' }));
  app.use(cookieParser());
  const container = await bootstrapContainer(customRepos);
  const repos = container.resolve<AppRepositories>(TOKENS.Repositories);
  if (process.env.SEED_DEMO === 'true')
    await repos.transaction(async () => {
      if (!(await repos.equipmentRepo.findAll()).length) await seedDatabase(repos);
    });
  const auth = await createAuth(repos);
  const outbox = new OutboxService(repos);
  const obs = createObservability(repos, outbox);
  app.use(obs.middleware);
  app.get('/metrics', obs.metrics);
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      try {
        await repos.getPool?.().query('SELECT 1');
        res.json({
          status: 'UP',
          timestamp: new Date().toISOString(),
          database: repos.isPostgres ? 'PostgreSQL' : 'DEMO_MEMORY'
        });
      } catch {
        res.status(503).json({ status: 'DOWN', database: 'UNAVAILABLE' });
      }
    })
  );
  app.get(
    '/api/cron/outbox',
    asyncHandler(async (req, res) => {
      if (
        !process.env.CRON_SECRET ||
        !secretMatches(req.get('Authorization'), `Bearer ${process.env.CRON_SECRET}`)
      )
        return res.sendStatus(401);
      res.json(await outbox.processBatch(5));
    })
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'MineFleet') {
      res.status(403).json({ error: 'Falta el encabezado X-Requested-With: MineFleet.' });
      return;
    }
    next();
  });
  app.post('/api/auth/login', auth.login);
  app.use('/api', auth.requireUser);
  app.get('/api/auth/me', (_req, res) => res.json({ data: res.locals.user }));
  app.post('/api/auth/logout', auth.logout);
  app.get(
    '/api/operations',
    asyncHandler(async (_req, res) => res.json({ data: await outbox.status() }))
  );
  app.post(
    '/api/operations/retry/:id',
    auth.requireSupervisor,
    createCommandRunner(repos)(
      asyncHandler(async (req, res) => {
        if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id)))
          return res.status(400).json({ error: 'Identificador inválido.' });
        const retried = await outbox.retry(String(req.params.id));
        if (retried)
          await repos.auditRepo.log({
            action: 'DELIVERY_RETRIED',
            entity_type: 'OUTBOX',
            entity_id: String(req.params.id),
            performed_by: res.locals.user.email,
            details: {}
          });
        res.status(retried ? 200 : 409).json({
          data: { retried },
          ...(!retried ? { error: 'Solo se pueden reintentar eventos agotados.' } : {})
        });
      })
    )
  );
  app.use(
    '/api',
    createApiRouter(container.resolve<ApiController>(TOKENS.ApiController), repos, auth.requireSupervisor)
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  const frontendDist = path.resolve('frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
  }
  app.use(errorHandler);
  return { app, container, repos, outbox, registry: obs.registry };
}
