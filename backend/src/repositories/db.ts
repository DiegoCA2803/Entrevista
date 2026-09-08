import 'dotenv/config';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import pkg from 'pg';
import type {
  IEquipmentRepository,
  IOperatorRepository,
  IShiftRepository,
  IMaintenanceRepository,
  IAuditRepository
} from './interfaces.js';
import {
  MemoryDatabaseState,
  MemoryEquipmentRepository,
  MemoryOperatorRepository,
  MemoryShiftRepository,
  MemoryMaintenanceRepository,
  MemoryAuditRepository
} from './memory-store.js';
import {
  PostgresEquipmentRepository,
  PostgresOperatorRepository,
  PostgresShiftRepository,
  PostgresMaintenanceRepository,
  PostgresAuditRepository
} from './postgres-store.js';

export interface AppRepositories {
  equipmentRepo: IEquipmentRepository;
  operatorRepo: IOperatorRepository;
  shiftRepo: IShiftRepository;
  maintenanceRepo: IMaintenanceRepository;
  auditRepo: IAuditRepository;
  isPostgres: boolean;
  transaction: <T>(work: () => Promise<T>) => Promise<T>;
  clearAll?: () => void;
  getPool?: () => pkg.Pool;
  close?: () => Promise<void>;
}

export async function createPostgresRepositories(connectionString: string): Promise<AppRepositories> {
  const pool = new pkg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 20000,
    ...(process.env.DATABASE_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {})
  });
  pool.on('error', (err) =>
    console.error(JSON.stringify({ event: 'database_pool_error', message: err.message }))
  );
  const context = new AsyncLocalStorage<pkg.PoolClient>();
  // Audit, outbox and business repositories share the transaction connection.
  const scopedPool = new Proxy(pool, {
    get(target, property) {
      if (property === 'query')
        return (...args: any[]) => (context.getStore() || target).query(...(args as [any]));
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  const transaction = async <T>(work: () => Promise<T>): Promise<T> => {
    if (context.getStore()) return work();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '10s'");
      // Single-site workload: serialize commands across API instances; reads stay concurrent.
      await client.query('SELECT pg_advisory_xact_lock(74201926)');
      const result = await context.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
  try {
    await transaction(async () => {
      await scopedPool.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    });
  } catch (err) {
    await pool.end();
    throw err;
  }
  return {
    equipmentRepo: new PostgresEquipmentRepository(scopedPool),
    operatorRepo: new PostgresOperatorRepository(scopedPool),
    shiftRepo: new PostgresShiftRepository(scopedPool),
    maintenanceRepo: new PostgresMaintenanceRepository(scopedPool),
    auditRepo: new PostgresAuditRepository(scopedPool),
    isPostgres: true,
    getPool: () => scopedPool,
    transaction,
    close: () => pool.end()
  };
}

// Explicit, ephemeral test/demo adapter. NEVER a fallback for a failed database.
export function resetRepositoriesForTesting(): AppRepositories {
  const state = new MemoryDatabaseState();
  let tail: Promise<unknown> = Promise.resolve();
  return {
    equipmentRepo: new MemoryEquipmentRepository(state),
    operatorRepo: new MemoryOperatorRepository(state),
    shiftRepo: new MemoryShiftRepository(state),
    maintenanceRepo: new MemoryMaintenanceRepository(state),
    auditRepo: new MemoryAuditRepository(state),
    isPostgres: false,
    clearAll: () => state.clear(),
    transaction: <T>(work: () => Promise<T>) => {
      const result = tail.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await work();
        } catch (err) {
          Object.assign(state, snapshot);
          throw err;
        }
      });
      tail = result.catch(() => {});
      return result;
    }
  };
}

let active: Promise<AppRepositories> | undefined;
export function getRepositories(): Promise<AppRepositories> {
  if (!active) {
    if (process.env.DATABASE_URL) active = createPostgresRepositories(process.env.DATABASE_URL);
    else if (
      process.env.NODE_ENV === 'test' ||
      (process.env.DEMO_MEMORY === 'true' && process.env.NODE_ENV !== 'production')
    )
      active = Promise.resolve(resetRepositoriesForTesting());
    else
      throw new Error(
        'DATABASE_URL es obligatorio. Use PostgreSQL o DEMO_MEMORY=true solo para una vista previa local.'
      );
    active.catch(() => {
      active = undefined;
    });
  }
  return active;
}
