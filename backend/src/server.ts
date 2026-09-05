import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { bootstrapContainer } from './core/container/bootstrap.js';
import { TOKENS } from './core/container/container.js';
import { ApiController } from './controllers/api.controller.js';
import { AppRepositories } from './repositories/db.js';
import { createApiRouter } from './routes/api.routes.js';
import { seedDatabase } from './seeds/seed.js';
import { errorHandler } from './core/middleware/error.middleware.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(customRepos?: AppRepositories) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // 1. Inicializar Contenedor de Inyección de Dependencias (IoC / SOLID)
  const container = await bootstrapContainer(customRepos);
  const repos = container.resolve<AppRepositories>(TOKENS.Repositories);
  const apiController = container.resolve<ApiController>(TOKENS.ApiController);

  // 2. Auto-seed si la base de datos está vacía
  const existingEquipment = await repos.equipmentRepo.findAll();
  if (existingEquipment.length === 0) {
    console.log('[Server] Base de datos vacía. Cargando datos de prueba iniciales...');
    await seedDatabase(repos);
  }

  // 3. Montar Rutas API con Controlador Inyectado
  app.use('/api', createApiRouter(apiController));

  // 4. Servir Frontend estático en producción si existe la carpeta dist
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    console.log(`[Server] Sirviendo frontend estático desde: ${frontendDist}`);
    app.use(express.static(frontendDist));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
      }
      next();
    });
  }

  // 5. Middleware Centralizado de Manejo de Errores (Clean Code)
  app.use(errorHandler);

  return { app, container, repos };
}

// Iniciar servidor si se ejecuta directamente
const isDirectRun = process.argv[1]?.includes('server.ts') || process.argv[1]?.includes('server.js');
if (isDirectRun || process.env.NODE_ENV !== 'test') {
  createApp().then(({ app }) => {
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 SERVICIO MINEFLEET CONTROL DE FLOTA ACTIVO`);
      console.log(`🧩 Inyección de Dependencias (IoC Container) Activada`);
      console.log(`📡 Servidor escuchando en: http://localhost:${PORT}`);
      console.log(`🔍 Endpoints API en: http://localhost:${PORT}/api/health`);
      console.log(`=======================================================`);
    });
  }).catch(err => {
    console.error('Error al iniciar el servidor:', err);
  });
}
