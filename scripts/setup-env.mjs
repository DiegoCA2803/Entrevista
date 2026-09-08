import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.log('.env ya existe. Se conserva su configuración.');
  process.exit(0);
}
const secret = () => randomBytes(32).toString('hex');
const password = secret();
writeFileSync(
  '.env',
  `NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://mine_user:${password}@localhost:55432/mine_fleet
POSTGRES_PASSWORD=${password}
JWT_SECRET=${secret()}
ADMIN_EMAIL=supervisor@minefleet.local
ADMIN_PASSWORD=MineFleet.Demo2026!
ADMIN_NAME=Supervisor de operaciones
VIEWER_EMAIL=consulta@minefleet.local
VIEWER_PASSWORD=MineFleet.Consulta2026!
SEED_DEMO=true
SHOW_DEMO_CREDENTIALS=true
COOKIE_SECURE=false
METRICS_TOKEN=${secret()}
WEBHOOK_SECRET=${secret()}
CRON_SECRET=${secret()}
GRAFANA_PASSWORD=MineFleet.Grafana2026!
QUEUE_TARGET_URL=http://localhost:4100/events
`,
  { mode: 0o600 }
);
console.log(
  '.env creado con secretos aleatorios y cuentas de demostración. Consulta README.md para las credenciales.'
);
