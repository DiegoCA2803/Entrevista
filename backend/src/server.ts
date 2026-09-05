import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getRepositories } from './repositories/db.js';
import { EquipmentService } from './services/equipment.service.js';
import { OperatorService } from './services/operator.service.js';
import { ShiftService } from './services/shift.service.js';
import { MaintenanceService } from './services/maintenance.service.js';
import { ProjectionService } from './services/projection.service.js';
import { AuditService } from './services/audit.service.js';
import { ApiController } from './controllers/api.controller.js';
import { createApiRouter } from './routes/api.routes.js';
import { seedDatabase } from './seeds/seed.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // 1. Inicializar Repositorios (PostgreSQL o Memoria Relacional)
  const repos = await getRepositories();

  // 2. Inicializar Servicios SOA (Aislamiento y Lógica de Negocio)
  const auditService = new AuditService(repos.auditRepo);
  const equipmentService = new EquipmentService(repos.equipmentRepo);
  const operatorService = new OperatorService(repos.operatorRepo);
  const shiftService = new ShiftService(
    repos.shiftRepo,
    repos.equipmentRepo,
    repos.operatorRepo,
    operatorService,
    equipmentService,
    auditService
  );
  const maintenanceService = new MaintenanceService(
    repos.maintenanceRepo,
    repos.equipmentRepo,
    repos.shiftRepo,
    auditService
  );
  const projectionService = new ProjectionService(
    repos.equipmentRepo,
    repos.shiftRepo
  );

  // Auto-seed si la base de datos está vacía
  const existingEquipment = await repos.equipmentRepo.findAll();
  if (existingEquipment.length === 0) {
    console.log('[Server] Base de datos vacía. Cargando datos de prueba iniciales...');
    await seedDatabase(repos);
  }

  // 3. Inicializar Controlador y Rutas API
  const apiController = new ApiController(
    equipmentService,
    operatorService,
    shiftService,
    maintenanceService,
    projectionService,
    auditService,
    repos
  );

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

  // Manejador global de errores
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[Error Global]:', err);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: err.message
    });
  });

  return { app, repos, services: { equipmentService, operatorService, shiftService, maintenanceService, projectionService, auditService } };
}

// Iniciar servidor si se ejecuta directamente
const isDirectRun = process.argv[1]?.includes('server.ts') || process.argv[1]?.includes('server.js');
if (isDirectRun || process.env.NODE_ENV !== 'test') {
  createApp().then(({ app }) => {
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 SERVICIO MINEROTECH CONTROL DE FLOTA ACTIVO`);
      console.log(`📡 Servidor escuchando en: http://localhost:${PORT}`);
      console.log(`🔍 Endpoints API en: http://localhost:${PORT}/api/health`);
      console.log(`=======================================================`);
    });
  }).catch(err => {
    console.error('Error al iniciar el servidor:', err);
  });
}
