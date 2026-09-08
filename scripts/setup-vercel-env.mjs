import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const target = new URL('../.env.vercel.local', import.meta.url);
if (existsSync(target)) {
  console.log('.env.vercel.local ya existe; se conserva sin cambios.');
} else {
  const secret = () => randomBytes(32).toString('hex');
  const password = () => randomBytes(18).toString('base64url');
  writeFileSync(
    target,
    [
      '# Archivo privado para importar en Vercel. No subir a GitHub.',
      '# Completa DATABASE_URL con la conexion pooled de Neon antes de importarlo.',
      'DATABASE_URL=',
      'NODE_ENV=production',
      'PORT=4000',
      'COOKIE_SECURE=true',
      'SEED_DEMO=true',
      'SHOW_DEMO_CREDENTIALS=true',
      `JWT_SECRET=${secret()}`,
      'ADMIN_EMAIL=supervisor@minefleet.local',
      'ADMIN_NAME="Supervisor de operaciones"',
      `ADMIN_PASSWORD=${password()}`,
      'VIEWER_EMAIL=consulta@minefleet.local',
      `VIEWER_PASSWORD=${password()}`,
      `METRICS_TOKEN=${secret()}`,
      `CRON_SECRET=${secret()}`,
      '# Opcional: receptor HTTPS externo. Sin receptor, la cola conserva los eventos pendientes.',
      'QUEUE_TARGET_URL=',
      `WEBHOOK_SECRET=${secret()}`,
      ''
    ].join('\n'),
    { mode: 0o600, flag: 'wx' }
  );
  console.log('Creado .env.vercel.local con secretos y contraseñas aleatorios.');
  console.log('Completa DATABASE_URL con Neon y luego importa el archivo en Vercel (Production).');
  console.log('Las credenciales de acceso estan en ADMIN_EMAIL y ADMIN_PASSWORD de ese archivo.');
}
