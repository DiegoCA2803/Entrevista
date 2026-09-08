import { createHash } from 'node:crypto';
import type { RequestHandler, Response, NextFunction } from 'express';
import type { AppRepositories } from '../repositories/db.js';
import { ConflictError, ValidationError, BusinessRuleViolationError } from './errors/app-error.js';
import { requestContext } from './request-context.js';
type Saved = { fingerprint: string; status_code: number; response: unknown };

export function createCommandRunner(repos: AppRepositories) {
  const memory = new Map<string, Saved>();
  return (handler: RequestHandler): RequestHandler =>
    async (req, res, next) => {
      const key = req.get('Idempotency-Key');
      const user = res.locals.user;
      try {
        if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key))
          throw new ValidationError('Envía una Idempotency-Key de 16 a 128 caracteres.');
        const fingerprint = createHash('sha256')
          .update(JSON.stringify([req.method, req.originalUrl, req.body]))
          .digest('hex');
        const memoryKey = `${user.id}:${key}`;
        const result = await repos.transaction(async () => {
          const pool = repos.getPool?.();
          const saved: Saved | undefined = pool
            ? (await pool.query('SELECT * FROM idempotency_keys WHERE user_id=$1 AND key=$2', [user.id, key]))
                .rows[0]
            : memory.get(memoryKey);
          if (saved) {
            if (saved.fingerprint !== fingerprint)
              throw new ConflictError(
                'Esta clave ya se usó para una solicitud diferente. Genera una nueva Idempotency-Key.'
              );
            return { ...saved, replay: true };
          }
          let status_code = 200;
          let response: unknown;
          let failure: unknown;
          const buffered = {
            locals: res.locals,
            status(code: number) {
              status_code = code;
              return this;
            },
            json(body: unknown) {
              response = body;
              return this;
            }
          } as Response;
          await requestContext.run({ requestId: res.locals.requestId, actor: user.email }, () =>
            handler(req, buffered, ((err: unknown) => {
              failure = err;
            }) as NextFunction)
          );
          if (failure) throw failure;
          if (response === undefined) throw new Error('El comando no generó una respuesta.');
          const entry = { fingerprint, status_code, response };
          if (pool)
            await pool.query(
              'INSERT INTO idempotency_keys(user_id,key,fingerprint,status_code,response) VALUES ($1,$2,$3,$4,$5)',
              [user.id, key, fingerprint, status_code, JSON.stringify(response)]
            );
          return { ...entry, replay: false };
        });
        if (!repos.isPostgres) memory.set(memoryKey, result);
        res
          .set('Idempotency-Replayed', String(result.replay))
          .status(result.status_code)
          .json(result.response);
      } catch (err) {
        if (err instanceof BusinessRuleViolationError) {
          try {
            await repos.transaction(() =>
              repos.auditRepo.log({
                action: 'ASSIGNMENT_REJECTED',
                entity_type: 'SHIFT',
                entity_id: String(req.params.id || 'new'),
                performed_by: user.email,
                details: { violations: err.violations, request_id: res.locals.requestId }
              })
            );
          } catch (auditError) {
            console.error(
              JSON.stringify({ event: 'rejection_audit_failed', request_id: res.locals.requestId })
            );
          }
        }
        next(err);
      }
    };
}
