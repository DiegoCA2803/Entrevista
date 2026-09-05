import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Pool } = pkg;
import {
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AppRepositories {
  equipmentRepo: IEquipmentRepository;
  operatorRepo: IOperatorRepository;
  shiftRepo: IShiftRepository;
  maintenanceRepo: IMaintenanceRepository;
  auditRepo: IAuditRepository;
  isPostgres: boolean;
  clearAll?: () => void;
  getPool?: () => pkg.Pool;
}

let activeRepos: AppRepositories | null = null;

export async function getRepositories(): Promise<AppRepositories> {
  if (activeRepos) {
    return activeRepos;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && process.env.NODE_ENV !== 'test') {
    try {
      console.log(`[DB] Intentando conectar a PostgreSQL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
      const pool = new Pool({
        connectionString: databaseUrl,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
      });
      
      await pool.query('SELECT 1');
      console.log('[DB] Conexión exitosa a PostgreSQL. Inicializando tablas...');

      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(sql);
        console.log('[DB] Esquema relacional PostgreSQL inicializado con éxito.');
      }

      activeRepos = {
        equipmentRepo: new PostgresEquipmentRepository(pool),
        operatorRepo: new PostgresOperatorRepository(pool),
        shiftRepo: new PostgresShiftRepository(pool),
        maintenanceRepo: new PostgresMaintenanceRepository(pool),
        auditRepo: new PostgresAuditRepository(pool),
        isPostgres: true,
        getPool: () => pool
      };
      return activeRepos;
    } catch (err: any) {
      console.warn(`[DB] Advertencia: No se pudo conectar a PostgreSQL (${err.message}). Utilizando almacén relacional en memoria.`);
    }
  }

  const memoryState = new MemoryDatabaseState();
  activeRepos = {
    equipmentRepo: new MemoryEquipmentRepository(memoryState),
    operatorRepo: new MemoryOperatorRepository(memoryState),
    shiftRepo: new MemoryShiftRepository(memoryState),
    maintenanceRepo: new MemoryMaintenanceRepository(memoryState),
    auditRepo: new MemoryAuditRepository(memoryState),
    isPostgres: false,
    clearAll: () => memoryState.clear()
  };

  return activeRepos;
}

export function resetRepositoriesForTesting(): AppRepositories {
  const memoryState = new MemoryDatabaseState();
  activeRepos = {
    equipmentRepo: new MemoryEquipmentRepository(memoryState),
    operatorRepo: new MemoryOperatorRepository(memoryState),
    shiftRepo: new MemoryShiftRepository(memoryState),
    maintenanceRepo: new MemoryMaintenanceRepository(memoryState),
    auditRepo: new MemoryAuditRepository(memoryState),
    isPostgres: false,
    clearAll: () => memoryState.clear()
  };
  return activeRepos;
}
