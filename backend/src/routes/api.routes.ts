import { Router } from 'express';
import { ApiController } from '../controllers/api.controller.js';

export function createApiRouter(controller: ApiController): Router {
  const router = Router();

  // Equipos
  router.get('/equipment', controller.getAllEquipment);
  router.get('/equipment/:id', controller.getEquipmentById);
  router.post('/equipment', controller.createEquipment);

  // Operadores
  router.get('/operators', controller.getAllOperators);
  router.post('/operators', controller.createOperator);
  router.post('/operators/:id/certifications', controller.addCertification);

  // Turnos y Asignaciones
  router.get('/shifts', controller.getAllShifts);
  router.get('/shifts/:id', controller.getShiftById);
  router.post('/shifts', controller.createShift);
  router.post('/shifts/:id/validate-assignment', controller.validateAssignment);
  router.post('/shifts/:id/assignments', controller.createAssignment);
  router.post('/shifts/:id/close', controller.closeShift);

  // Mantenimiento
  router.get('/maintenance', controller.getAllMaintenance);
  router.post('/maintenance', controller.registerMaintenance);

  // Proyección a 7 Días (Regla 12)
  router.get('/projection', controller.get7DayProjection);

  // Auditoría, Salud y Demostración
  router.get('/health', controller.getHealth);
  router.get('/audit-logs', controller.getAuditLogs);
  router.post('/demo/reset', controller.resetDemoData);

  return router;
}
