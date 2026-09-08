import { DIContainer, TOKENS } from './container.js';
import { AppRepositories, getRepositories } from '../../repositories/db.js';
import { EquipmentService } from '../../services/equipment.service.js';
import { OperatorService } from '../../services/operator.service.js';
import { ShiftService } from '../../services/shift.service.js';
import { MaintenanceService } from '../../services/maintenance.service.js';
import { ProjectionService } from '../../services/projection.service.js';
import { AuditService } from '../../services/audit.service.js';
import { ApiController } from '../../controllers/api.controller.js';

/**
 * Composition Root: Punto centralizado donde se configuran e inyectan
 * todas las dependencias del sistema siguiendo el principio DIP (SOLID).
 */
export async function bootstrapContainer(customRepos?: AppRepositories): Promise<DIContainer> {
  const container = new DIContainer();

  // 1. Repositorios de Persistencia
  const repos = customRepos || (await getRepositories());
  container.register<AppRepositories>(TOKENS.Repositories, repos);

  // 2. Servicio de Auditoría
  container.registerFactory<AuditService>(TOKENS.AuditService, (c) => {
    const r = c.resolve<AppRepositories>(TOKENS.Repositories);
    return new AuditService(r.auditRepo);
  });

  // 3. Servicio de Equipos
  container.registerFactory<EquipmentService>(TOKENS.EquipmentService, (c) => {
    const r = c.resolve<AppRepositories>(TOKENS.Repositories);
    return new EquipmentService(r.equipmentRepo);
  });

  // 4. Servicio de Operadores
  container.registerFactory<OperatorService>(TOKENS.OperatorService, (c) => {
    const r = c.resolve<AppRepositories>(TOKENS.Repositories);
    return new OperatorService(r.operatorRepo);
  });

  // 5. Servicio de Turnos y Asignaciones (Núcleo de Reglas 5-11)
  container.registerFactory<ShiftService>(TOKENS.ShiftService, (c) => {
    const r = c.resolve<AppRepositories>(TOKENS.Repositories);
    const opService = c.resolve<OperatorService>(TOKENS.OperatorService);
    const eqService = c.resolve<EquipmentService>(TOKENS.EquipmentService);
    const auditService = c.resolve<AuditService>(TOKENS.AuditService);
    return new ShiftService(r.shiftRepo, r.equipmentRepo, r.operatorRepo, opService, eqService, auditService);
  });

  // 6. Servicio de Mantenimiento (Reglas 2-3)
  container.registerFactory<MaintenanceService>(TOKENS.MaintenanceService, (c) => {
    const r = c.resolve<AppRepositories>(TOKENS.Repositories);
    const auditService = c.resolve<AuditService>(TOKENS.AuditService);
    return new MaintenanceService(
      r.maintenanceRepo,
      r.equipmentRepo,
      r.shiftRepo,
      auditService,
      c.resolve<OperatorService>(TOKENS.OperatorService)
    );
  });

  // 7. Servicio de Proyecciones a 7 Días (Regla 12 + Resiliencia)
  container.registerFactory<ProjectionService>(TOKENS.ProjectionService, (c) => {
    const r = c.resolve<AppRepositories>(TOKENS.Repositories);
    return new ProjectionService(r.equipmentRepo, r.shiftRepo);
  });

  // 8. Controlador de la API REST (Capa de Presentación)
  container.registerFactory<ApiController>(TOKENS.ApiController, (c) => {
    return new ApiController(
      c.resolve<EquipmentService>(TOKENS.EquipmentService),
      c.resolve<OperatorService>(TOKENS.OperatorService),
      c.resolve<ShiftService>(TOKENS.ShiftService),
      c.resolve<MaintenanceService>(TOKENS.MaintenanceService),
      c.resolve<ProjectionService>(TOKENS.ProjectionService),
      c.resolve<AuditService>(TOKENS.AuditService),
      c.resolve<AppRepositories>(TOKENS.Repositories)
    );
  });

  return container;
}
