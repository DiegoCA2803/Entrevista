import 'dotenv/config';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
if (!process.env.DATABASE_URL) throw new Error('Ejecuta npm run setup y docker compose up -d postgres.');
const base = new URL(process.env.DATABASE_URL);
const dbName = `minefleet_test_${randomBytes(6).toString('hex')}`;
const pool = new pg.Pool({ connectionString: base.toString() });
let exitCode = 1;
try {
  await pool.query(`CREATE DATABASE "${dbName}"`);
  base.pathname = `/${dbName}`;
  const result = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', 'backend/src/tests/postgres.integration.test.ts'],
    {
      stdio: 'inherit',
      env: { ...process.env, TEST_DATABASE_URL: base.toString(), NODE_ENV: 'test', SEED_DEMO: 'false' }
    }
  );
  exitCode = result.status ?? 1;
} finally {
  // Only this invocation's generated, isolated test database can be dropped.
  if (!/^minefleet_test_[a-f0-9]{12}$/.test(dbName)) throw new Error('Nombre de base de prueba inválido.');
  await pool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await pool.end();
}
process.exit(exitCode);
