import { Router, type RequestHandler } from 'express';
import { ApiController } from '../controllers/api.controller.js';
import { AppRepositories } from '../repositories/db.js';
import { createCommandRunner } from '../core/command.js';
import { schemas, validate } from '../core/validation.js';

export function createApiRouter(
  controller: ApiController,
  repos: AppRepositories,
  supervisor: RequestHandler
): Router {
  const router = Router();
  const command = createCommandRunner(repos);
  router.get('/equipment', controller.getAllEquipment);
  router.get('/equipment/:id', controller.getEquipmentById);
  router.post('/equipment', supervisor, validate(schemas.equipment), command(controller.createEquipment));
  router.get('/operators', controller.getAllOperators);
  router.post('/operators', supervisor, validate(schemas.operator), command(controller.createOperator));
  router.post(
    '/operators/:id/certifications',
    supervisor,
    validate(schemas.certification),
    command(controller.addCertification)
  );
  router.get('/shifts', controller.getAllShifts);
  router.get('/shifts/:id', controller.getShiftById);
  router.post('/shifts', supervisor, validate(schemas.shift), command(controller.createShift));
  router.post('/shifts/:id/validate-assignment', validate(schemas.assignment), controller.validateAssignment);
  router.post(
    '/shifts/:id/assignments',
    supervisor,
    validate(schemas.assignment),
    command(controller.createAssignment)
  );
  router.post('/shifts/:id/close', supervisor, validate(schemas.close), command(controller.closeShift));
  router.post(
    '/shifts/:id/assignments/:assignmentId/cancel',
    supervisor,
    validate(schemas.cancel),
    command(controller.cancelAssignment)
  );
  router.get('/maintenance', controller.getAllMaintenance);
  router.post(
    '/maintenance',
    supervisor,
    validate(schemas.maintenance),
    command(controller.registerMaintenance)
  );
  router.get('/projection', controller.get7DayProjection);
  router.get('/audit-logs', controller.getAuditLogs);
  return router;
}
