import 'dotenv/config';
import { getRepositories } from './repositories/db.js';
import { OutboxService } from './services/outbox.service.js';
const repos = await getRepositories();
if (!process.env.QUEUE_TARGET_URL) throw new Error('El worker requiere QUEUE_TARGET_URL.');
const outbox = new OutboxService(repos);
let stopped = false;
process.on('SIGTERM', () => {
  stopped = true;
});
process.on('SIGINT', () => {
  stopped = true;
});
while (!stopped) {
  try {
    await outbox.processBatch(10);
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'worker_error', message: err instanceof Error ? err.message : 'Error' })
    );
  }
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5000));
}
await repos.close?.();
