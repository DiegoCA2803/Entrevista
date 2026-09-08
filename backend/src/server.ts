import 'dotenv/config';
import { createApp } from './app.js';
export { createApp } from './app.js';
const { app, repos } = await createApp();
const port = Number(process.env.PORT || 4000);
const server = app.listen(port, '0.0.0.0', () => console.log(`[MineFleet] http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(() => {
      void repos.close?.();
    })
  );
