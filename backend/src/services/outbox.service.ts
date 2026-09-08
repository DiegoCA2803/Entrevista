import { createHmac, randomUUID } from 'node:crypto';
import type { AppRepositories } from '../repositories/db.js';

export class OutboxService {
  constructor(
    private repos: AppRepositories,
    private target = process.env.QUEUE_TARGET_URL,
    private secret = process.env.WEBHOOK_SECRET
  ) {}
  async processBatch(limit = 10) {
    const pool = this.repos.getPool?.();
    if (!pool || !this.target) return { processed: 0, delivered: 0, failed: 0, configured: false };
    if (!this.secret || this.secret.length < 32)
      throw new Error('WEBHOOK_SECRET debe tener al menos 32 caracteres.');
    const result = { processed: 0, delivered: 0, failed: 0, configured: true };
    for (let i = 0; i < limit; i++) {
      const token = randomUUID();
      // One atomic claim, safe across workers. Expired leases recover after a crash.
      const row = (
        await pool.query(
          `WITH candidate AS (
        SELECT id FROM outbox_events WHERE (status='PENDING' AND available_at<=now())
          OR (status='PROCESSING' AND locked_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE outbox_events e SET status='PROCESSING', attempts=e.attempts+1,locked_until=now()+interval '30 seconds',lock_token=$1
        FROM candidate c WHERE e.id=c.id RETURNING e.*`,
          [token]
        )
      ).rows[0];
      if (!row) break;
      result.processed++;
      try {
        const body = JSON.stringify({ id: row.id, topic: row.topic, payload: row.payload });
        const response = await fetch(this.target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': row.id,
            'X-MineFleet-Signature': createHmac('sha256', this.secret).update(body).digest('hex')
          },
          body,
          signal: AbortSignal.timeout(5000),
          redirect: 'error'
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`Servicio receptor respondió HTTP ${response.status}`);
        await pool.query(
          `UPDATE outbox_events SET status='DELIVERED',delivered_at=now(),locked_until=NULL,last_error=NULL WHERE id=$1 AND lock_token=$2`,
          [row.id, token]
        );
        result.delivered++;
      } catch (err) {
        const dead = row.attempts >= 10;
        const delay = Math.min(3600, 5 * 2 ** Math.min(row.attempts - 1, 10));
        await pool.query(
          `UPDATE outbox_events SET status=$1,available_at=now()+($2*interval '1 second'),last_error=$3,locked_until=NULL WHERE id=$4 AND lock_token=$5`,
          [
            dead ? 'DEAD' : 'PENDING',
            delay,
            err instanceof Error ? err.message : 'Error de entrega',
            row.id,
            token
          ]
        );
        console.warn(
          JSON.stringify({ event: 'outbox_retry', event_id: row.id, attempt: row.attempts, dead })
        );
        result.failed++;
      }
    }
    return result;
  }
  async status() {
    const pool = this.repos.getPool?.();
    if (!pool)
      return {
        persistent: false,
        configured: false,
        counts: { PENDING: 0, PROCESSING: 0, DELIVERED: 0, DEAD: 0 },
        events: [],
        lastDelivery: null
      };
    const [counts, events, last] = await Promise.all([
      pool.query('SELECT status,count(*)::int AS count FROM outbox_events GROUP BY status'),
      pool.query(
        'SELECT id,topic,status,attempts,last_error,created_at,available_at,delivered_at FROM outbox_events ORDER BY created_at DESC LIMIT 50'
      ),
      pool.query('SELECT max(delivered_at) AS last FROM outbox_events')
    ]);
    return {
      persistent: true,
      configured: !!this.target,
      counts: {
        PENDING: 0,
        PROCESSING: 0,
        DELIVERED: 0,
        DEAD: 0,
        ...Object.fromEntries(counts.rows.map((r) => [r.status, r.count]))
      },
      events: events.rows,
      lastDelivery: last.rows[0].last
    };
  }
  async retry(id: string) {
    const pool = this.repos.getPool?.();
    if (!pool) return false;
    const result = await pool.query(
      `UPDATE outbox_events SET status='PENDING',attempts=0,available_at=now(),locked_until=NULL,lock_token=NULL WHERE id=$1 AND status='DEAD' RETURNING id`,
      [id]
    );
    return !!result.rowCount;
  }
}
