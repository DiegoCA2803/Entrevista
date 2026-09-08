import { copyFileSync } from 'node:fs';
copyFileSync('backend/src/repositories/schema.sql', 'backend/dist/repositories/schema.sql');
