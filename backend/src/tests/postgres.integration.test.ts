import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { createApp } from '../app.js';
import { createPostgresRepositories, AppRepositories } from '../repositories/db.js';
import { seedDatabase } from '../seeds/seed.js';
import { OutboxService } from '../services/outbox.service.js';
import { ShiftService } from '../services/shift.service.js';
import { TOKENS } from '../core/container/container.js';
import { localDate } from '../domain/time.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'PostgreSQL real: atomicidad, JWT, concurrencia y recuperación',
  () => {
    let first: Awaited<ReturnType<typeof createApp>>, second: typeof first;
    let repos: AppRepositories, repos2: AppRepositories;
    let cookie: string, viewerCookie: string;
    const headers = { 'X-Requested-With': 'MineFleet' };
    beforeAll(async () => {
      if (!new URL(process.env.TEST_DATABASE_URL!).pathname.startsWith('/minefleet_test_'))
        throw new Error('Se exige una base de prueba aislada.');
      process.env.JWT_SECRET = 'integration-jwt-secret-32-characters-minimum';
      process.env.ADMIN_EMAIL = 'test-supervisor@minefleet.local';
      process.env.ADMIN_PASSWORD = 'Integration.Supervisor2026!';
      process.env.VIEWER_EMAIL = 'test-viewer@minefleet.local';
      process.env.VIEWER_PASSWORD = 'Integration.Consulta2026!';
      process.env.SEED_DEMO = 'false';
      repos = await createPostgresRepositories(process.env.TEST_DATABASE_URL!);
      repos2 = await createPostgresRepositories(process.env.TEST_DATABASE_URL!);
      first = await createApp(repos);
      second = await createApp(repos2);
      const login = await request(first.app)
        .post('/api/auth/login')
        .set(headers)
        .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
      expect(login.status).toBe(200);
      cookie = login.headers['set-cookie'][0].split(';')[0];
      const viewer = await request(first.app)
        .post('/api/auth/login')
        .set(headers)
        .send({ email: process.env.VIEWER_EMAIL, password: process.env.VIEWER_PASSWORD });
      viewerCookie = viewer.headers['set-cookie'][0].split(';')[0];
    }, 30000);
    beforeEach(async () => {
      await repos.getPool!().query(
        'TRUNCATE outbox_events,audit_logs,idempotency_keys,maintenance_records,assignments,shifts,certifications,operators,equipment CASCADE'
      );
      await repos.transaction(() => seedDatabase(repos));
    });
    afterAll(async () => {
      await repos?.close?.();
      await repos2?.close?.();
    });
    const post = (path: string, body: object, key = randomUUID(), app = first.app, auth = cookie) =>
      request(app)
        .post(path)
        .set({ ...headers, 'Idempotency-Key': key, Cookie: auth })
        .send(body);
    const criticalShift = async () =>
      (await repos.shiftRepo.findAll()).find((s) => s.date === localDate() && s.period === 'DIA')!;
    const resources = async () => ({
      equipment: await repos.equipmentRepo.findAll(),
      operators: await repos.operatorRepo.findAll()
    });

    it('protege lecturas, rechaza JWT alterados y permite consulta sin escrituras', async () => {
      expect((await request(first.app).get('/api/equipment')).status).toBe(401);
      expect(
        (await request(first.app).get('/api/equipment').set('Authorization', 'Bearer forged.jwt.token'))
          .status
      ).toBe(401);
      expect((await request(second.app).get('/api/equipment').set('Cookie', viewerCookie)).status).toBe(200);
      expect((await post('/api/equipment', {}, randomUUID(), second.app, viewerCookie)).status).toBe(403);
    });
    it('rechaza intentos CSRF y peticiones sin clave idempotente', async () => {
      expect(
        (await request(first.app).post('/api/auth/login').send({ email: 'a', password: 'b' })).status
      ).toBe(403);
      const shift = await criticalShift();
      expect(
        (
          await request(first.app)
            .post(`/api/shifts/${shift.id}/close`)
            .set({ ...headers, Cookie: cookie })
            .send({ actual_duration_hours: 8 })
        ).status
      ).toBe(400);
    });
    it('dos instancias cierran con la misma clave y suman horas una sola vez', async () => {
      const shift = await criticalShift();
      const key = randomUUID();
      const responses = await Promise.all([
        post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }, key),
        post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }, key, second.app)
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(responses[0].body).toEqual(responses[1].body);
      expect(responses.map((r) => r.headers['idempotency-replayed']).sort()).toEqual(['false', 'true']);
      const eq = await repos.equipmentRepo.findByCode('CAM-001');
      expect(eq?.horometer).toBe(254);
      expect(eq?.status).toBe('BLOQUEADO');
      expect(responses[0].body.data.shift.closed_by).toBe(process.env.ADMIN_EMAIL);
      expect((await repos.auditRepo.findAll()).filter((a) => a.action === 'SHIFT_CLOSED')).toHaveLength(1);
      expect(responses[0].body.data.flaggedUpcomingAssignmentsCount).toBeGreaterThan(0);
    });
    it('dos cierres con claves diferentes no duplican uso', async () => {
      const shift = await criticalShift();
      const result = await Promise.all([
        post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }),
        post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }, randomUUID(), second.app)
      ]);
      expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await repos.equipmentRepo.findByCode('CAM-001'))?.horometer).toBe(254);
    });
    it('una clave no puede reutilizarse con contenido diferente', async () => {
      const shift = await criticalShift();
      const key = randomUUID();
      expect((await post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }, key)).status).toBe(
        200
      );
      expect((await post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 7 }, key)).status).toBe(
        409
      );
    });
    it('un fallo de auditoría revierte horómetros, cierre e idempotencia', async () => {
      const shift = await criticalShift();
      const before = await repos.equipmentRepo.findByCode('CAM-001');
      const spy = vi
        .spyOn(repos.auditRepo, 'log')
        .mockRejectedValueOnce(new Error('Simulación: almacenamiento de auditoría caído'));
      const key = randomUUID();
      expect((await post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }, key)).status).toBe(
        500
      );
      spy.mockRestore();
      expect((await repos.equipmentRepo.findByCode('CAM-001'))?.horometer).toBe(before?.horometer);
      expect((await repos.shiftRepo.findById(shift.id))?.status).toBe('PROGRAMADO');
      expect((await post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 }, key)).status).toBe(
        200
      );
    });
    it('el formulario completo guarda todas las parejas y notas en una transacción', async () => {
      const { equipment, operators } = await resources();
      const payload = {
        date: '2030-01-01',
        period: 'DIA',
        planned_duration_hours: 8,
        notes: 'Frente norte: dos recursos',
        assignments: [
          {
            equipment_id: equipment.find((e) => e.code === 'CAM-001')!.id,
            operator_id: operators.find((o) => o.code === 'OP-001')!.id
          },
          {
            equipment_id: equipment.find((e) => e.code === 'CAM-002')!.id,
            operator_id: operators.find((o) => o.code === 'OP-004')!.id
          }
        ]
      };
      await repos.getPool!().query("UPDATE certifications SET expiration_date='2031-01-01'");
      const result = await post('/api/shifts', payload);
      expect(result.status, result.text).toBe(201);
      expect(result.body.data.assignments).toHaveLength(2);
      expect(result.body.data.notes).toBe(payload.notes);
    });
    it('acumula los rechazos de todo el formulario y no crea un turno parcial', async () => {
      const { equipment, operators } = await resources();
      const eq = equipment.find((e) => e.code === 'EXC-101')!;
      const op = operators.find((o) => o.code === 'OP-003')!;
      const result = await post('/api/shifts', {
        date: '2030-01-02',
        period: 'DIA',
        planned_duration_hours: 8,
        assignments: [
          { equipment_id: eq.id, operator_id: op.id },
          { equipment_id: eq.id, operator_id: op.id }
        ]
      });
      expect(result.status).toBe(422);
      expect(result.body.violations.length).toBeGreaterThanOrEqual(4);
      expect(await repos.shiftRepo.findByCode('TUR-2030-01-02-D')).toBeNull();
      expect((await repos.auditRepo.findAll()).some((a) => a.action === 'ASSIGNMENT_REJECTED')).toBe(true);
    });
    it('dos supervisores no pueden asignar simultáneamente el mismo equipo', async () => {
      const service = first.container.resolve<ShiftService>(TOKENS.ShiftService);
      const shift = await repos.transaction(() => service.createShift({ date: '2030-01-03', period: 'DIA' }));
      await repos.getPool!().query("UPDATE certifications SET expiration_date='2031-01-01'");
      const { equipment, operators } = await resources();
      const eq = equipment.find((e) => e.code === 'CAM-002')!;
      const result = await Promise.all(
        ['OP-001', 'OP-004'].map((code, i) =>
          post(
            `/api/shifts/${shift.id}/assignments`,
            { equipment_id: eq.id, operator_id: operators.find((o) => o.code === code)!.id },
            randomUUID(),
            i ? second.app : first.app
          )
        )
      );
      expect(result.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await repos.shiftRepo.findAssignmentsByShiftId(shift.id)).toHaveLength(1);
    });
    it('una certificación que vence durante la noche impide programar el turno', async () => {
      const { equipment, operators } = await resources();
      const op = operators.find((o) => o.code === 'OP-004')!;
      await repos.getPool!().query(
        "UPDATE certifications SET expiration_date='2030-01-04' WHERE operator_id=$1",
        [op.id]
      );
      const result = await post('/api/shifts', {
        date: '2030-01-04',
        period: 'NOCHE',
        planned_duration_hours: 8,
        assignments: [{ equipment_id: equipment.find((e) => e.code === 'CAM-002')!.id, operator_id: op.id }]
      });
      expect(result.status).toBe(422);
      expect(result.body.violations.join(' ')).toContain('durante el turno');
    });
    it('rechaza el retroceso del horómetro y conserva el valor real del mantenimiento', async () => {
      const eq = (await repos.equipmentRepo.findByCode('EXC-101'))!;
      expect(
        (
          await post('/api/maintenance', {
            equipment_id: eq.id,
            notes: 'Servicio preventivo completo',
            horometer_at_maintenance: 500
          })
        ).status
      ).toBe(400);
      const result = await post('/api/maintenance', {
        equipment_id: eq.id,
        notes: 'Servicio preventivo completo',
        horometer_at_maintenance: 530
      });
      expect(result.status).toBe(201);
      expect(result.body.data.equipment.horometer).toBe(530);
      expect(result.body.data.equipment.last_maintenance_horometer).toBe(530);
      expect(result.body.data.record.performed_by).toBe(process.env.ADMIN_EMAIL);
    });
    it('cancelar conserva historial, libera recursos y no suma horas al equipo cancelado', async () => {
      const shift = await criticalShift();
      const assignment = shift.assignments!.find((a) => a.equipment?.code === 'CAM-001')!;
      expect(
        (
          await post(`/api/shifts/${shift.id}/assignments/${assignment.id}/cancel`, {
            reason: 'Cambio de planificación'
          })
        ).status
      ).toBe(200);
      expect((await post(`/api/shifts/${shift.id}/close`, { actual_duration_hours: 8 })).status).toBe(200);
      expect((await repos.equipmentRepo.findByCode('CAM-001'))?.horometer).toBe(246);
      expect((await repos.shiftRepo.findAssignmentById(assignment.id))?.status).toBe('CANCELADA');
    });
    it('la cola retiene fallos, recupera la entrega y dos workers no duplican el reclamo', async () => {
      let failing = true;
      const received: string[] = [];
      const secret = 'integration-webhook-secret-with-32-characters';
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          expect(req.headers['x-minefleet-signature']).toBe(
            createHmac('sha256', secret).update(body).digest('hex')
          );
          if (failing) {
            res.writeHead(503);
            res.end();
            return;
          }
          received.push(JSON.parse(body).id);
          res.writeHead(200);
          res.end();
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as { port: number }).port;
      try {
        const event = await repos.transaction(() =>
          repos.auditRepo.log({
            action: 'TEST_DELIVERY',
            entity_type: 'TEST',
            entity_id: 'test',
            performed_by: 'test',
            details: {}
          })
        );
        const worker = new OutboxService(repos, `http://127.0.0.1:${port}`, secret);
        const other = new OutboxService(repos2, `http://127.0.0.1:${port}`, secret);
        expect((await worker.processBatch(1)).failed).toBe(1);
        let row = (await repos.getPool!().query('SELECT * FROM outbox_events WHERE id=$1', [event.id]))
          .rows[0];
        expect(row.status).toBe('PENDING');
        expect(row.attempts).toBe(1);
        expect(new Date(row.available_at).getTime()).toBeGreaterThan(Date.now());
        failing = false;
        await repos.getPool!().query('UPDATE outbox_events SET available_at=now() WHERE id=$1', [event.id]);
        await Promise.all([worker.processBatch(1), other.processBatch(1)]);
        row = (await repos.getPool!().query('SELECT * FROM outbox_events WHERE id=$1', [event.id])).rows[0];
        expect(row.status).toBe('DELIVERED');
        expect(received.filter((id) => id === event.id)).toHaveLength(1);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
    it('recupera leases vencidos y envía fallos agotados a revisión manual', async () => {
      const event = await repos.transaction(() =>
        repos.auditRepo.log({
          action: 'TEST_LEASE',
          entity_type: 'TEST',
          entity_id: 'test',
          performed_by: 'test',
          details: {}
        })
      );
      await repos.getPool!().query(
        "UPDATE outbox_events SET status='PROCESSING',attempts=9,locked_until=now()-interval '1 minute' WHERE id=$1",
        [event.id]
      );
      const worker = new OutboxService(
        repos,
        'http://127.0.0.1:1',
        'integration-secret-with-at-least-32-characters'
      );
      expect((await worker.processBatch(1)).failed).toBe(1);
      expect(
        (await repos.getPool!().query('SELECT status FROM outbox_events WHERE id=$1', [event.id])).rows[0]
          .status
      ).toBe('DEAD');
      expect((await post(`/api/operations/retry/${event.id}`, {})).status).toBe(200);
      expect(
        (await repos.getPool!().query('SELECT status FROM outbox_events WHERE id=$1', [event.id])).rows[0]
          .status
      ).toBe('PENDING');
    });
    it('logout revoca la sesión también en otra instancia', async () => {
      const login = await request(first.app)
        .post('/api/auth/login')
        .set(headers)
        .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
      const localCookie = login.headers['set-cookie'][0].split(';')[0];
      expect((await post('/api/auth/logout', {}, randomUUID(), first.app, localCookie)).status).toBe(200);
      expect((await request(second.app).get('/api/auth/me').set('Cookie', localCookie)).status).toBe(401);
    });
  },
  30000
);
