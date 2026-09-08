// Local integration receiver: persists delivery once, even when a worker retries after a crash.
import 'dotenv/config';
import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import pkg from 'pg';
const pool = new pkg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000
});
pool.on('error', () => console.error(JSON.stringify({ event: 'receiver_database_unavailable' })));
await pool.query(
  'CREATE TABLE IF NOT EXISTS notification_inbox(id UUID PRIMARY KEY,event JSONB NOT NULL,received_at TIMESTAMPTZ DEFAULT now())'
);
const secret = process.env.WEBHOOK_SECRET;
if (!secret || secret.length < 32) throw new Error('WEBHOOK_SECRET inválido.');
const app = express();
app.use(express.raw({ type: 'application/json', limit: '128kb' }));
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'UP' });
  } catch {
    res.status(503).json({ status: 'DOWN' });
  }
});
app.post('/events', async (req, res) => {
  if (!Buffer.isBuffer(req.body)) {
    res.sendStatus(415);
    return;
  }
  const expected = Buffer.from(createHmac('sha256', secret).update(req.body).digest('hex'));
  const actual = Buffer.from(req.get('X-MineFleet-Signature') || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    res.sendStatus(401);
    return;
  }
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    res.sendStatus(400);
    return;
  }
  try {
    if (
      !event ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.id) ||
      event.id !== req.get('Idempotency-Key')
    ) {
      res.sendStatus(400);
      return;
    }
    await pool.query('INSERT INTO notification_inbox(id,event) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [
      event.id,
      JSON.stringify(event)
    ]);
    res.sendStatus(200);
  } catch {
    res.sendStatus(503);
  }
});
const server = app.listen(4100, '0.0.0.0');
process.on('SIGTERM', () =>
  server.close(() => {
    void pool.end();
  })
);
