import { Request, Response, NextFunction } from 'express';
import { EquipmentService } from '../services/equipment.service.js';
import { OperatorService } from '../services/operator.service.js';
import { ShiftService } from '../services/shift.service.js';
import { MaintenanceService } from '../services/maintenance.service.js';
import { ProjectionService } from '../services/projection.service.js';
import { AuditService } from '../services/audit.service.js';
import { ResilientExecutor } from '../resilience/resilient-executor.js';
import { seedDatabase } from '../seeds/seed.js';
import { AppRepositories } from '../repositories/db.js';
import { HTTP_STATUS } from '../core/constants/index.js';
import { NotFoundError } from '../core/errors/app-error.js';

export class ApiController {
  constructor(
    private readonly equipmentService: EquipmentService,
    private readonly operatorService: OperatorService,
    private readonly shiftService: ShiftService,
    private readonly maintenanceService: MaintenanceService,
    private readonly projectionService: ProjectionService,
    private readonly auditService: AuditService,
    private readonly repos: AppRepositories
  ) {}

  // ----------------------------------------------------
  // EQUIPOS
  // ----------------------------------------------------
  getAllEquipment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const equipment = await this.equipmentService.getAllEquipment();
      res.status(HTTP_STATUS.OK).json({ success: true, data: equipment });
    } catch (err) {
      next(err);
    }
  };

  getEquipmentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eq = await this.equipmentService.getEquipmentById(String(req.params.id));
      if (!eq) throw new NotFoundError('Equipo minero', req.params.id as string);
      res.status(HTTP_STATUS.OK).json({ success: true, data: eq });
    } catch (err) {
      next(err);
    }
  };

  createEquipment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eq = await this.equipmentService.createEquipment(req.body);
      res.status(HTTP_STATUS.CREATED).json({ success: true, data: eq });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // OPERADORES
  // ----------------------------------------------------
  getAllOperators = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const operators = await this.operatorService.getAllOperators();
      res.status(HTTP_STATUS.OK).json({ success: true, data: operators });
    } catch (err) {
      next(err);
    }
  };

  createOperator = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const op = await this.operatorService.createOperator(req.body);
      res.status(HTTP_STATUS.CREATED).json({ success: true, data: op });
    } catch (err) {
      next(err);
    }
  };

  addCertification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cert = await this.operatorService.addCertification({
        operator_id: String(req.params.id),
        ...req.body
      });
      res.status(HTTP_STATUS.CREATED).json({ success: true, data: cert });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // TURNOS Y ASIGNACIONES
  // ----------------------------------------------------
  getAllShifts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shifts = await this.shiftService.getAllShifts();
      res.status(HTTP_STATUS.OK).json({ success: true, data: shifts });
    } catch (err) {
      next(err);
    }
  };

  getShiftById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shift = await this.shiftService.getShiftById(String(req.params.id));
      if (!shift) throw new NotFoundError('Turno minero', req.params.id as string);
      res.status(HTTP_STATUS.OK).json({ success: true, data: shift });
    } catch (err) {
      next(err);
    }
  };

  createShift = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shift = await this.shiftService.createShift(req.body);
      res.status(HTTP_STATUS.CREATED).json({ success: true, data: shift });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Endpoint de pre-validación de asignaciones (Regla 11)
   * Devuelve TODAS las razones de incumplimiento sin persistir cambios.
   */
  validateAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { equipment_id, operator_id } = req.body;
      const shiftId = String(req.params.id);
      const validation = await this.shiftService.validateAssignment(shiftId, equipment_id, operator_id);
      res.status(HTTP_STATUS.OK).json({ success: true, data: validation });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Endpoint de creación de asignación.
   * Maneja excepciones de supervisor y garantía de concurrencia.
   */
  createAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { equipment_id, operator_id, is_override, override_by, override_reason } = req.body;
      const shiftId = String(req.params.id);

      const assignment = await this.shiftService.createAssignment({
        shift_id: shiftId,
        equipment_id,
        operator_id,
        is_override,
        override_by,
        override_reason
      });

      res.status(HTTP_STATUS.CREATED).json({ success: true, data: assignment });
    } catch (err) {
      next(err);
    }
  };

  /**
   * Cierre de turno (Regla 10 y Decisión 1)
   */
  closeShift = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { actual_duration_hours, closed_by, notes } = req.body;
      const shiftId = String(req.params.id);

      const result = await this.shiftService.closeShift({
        shift_id: shiftId,
        actual_duration_hours,
        closed_by,
        notes
      });

      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // MANTENIMIENTO
  // ----------------------------------------------------
  getAllMaintenance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const records = await this.maintenanceService.getAllMaintenanceRecords();
      res.status(HTTP_STATUS.OK).json({ success: true, data: records });
    } catch (err) {
      next(err);
    }
  };

  registerMaintenance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.maintenanceService.registerMaintenance(req.body);
      res.status(HTTP_STATUS.CREATED).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // PROYECCIÓN A 7 DÍAS (Regla 12 + Degradación Elegante)
  // ----------------------------------------------------
  get7DayProjection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const referenceDate = req.query.reference_date as string | undefined;
      const result = await this.projectionService.get7DayMaintenanceProjection(referenceDate);
      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // AUDITORÍA Y SALUD DEL SISTEMA (SOA Healthcheck)
  // ----------------------------------------------------
  getHealth = async (req: Request, res: Response): Promise<void> => {
    const servicesHealth = ResilientExecutor.getServicesHealth();
    res.status(HTTP_STATUS.OK).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      architecture: 'Layered + SOA with Graceful Degradation (DI Container wired)',
      database: this.repos.isPostgres ? 'PostgreSQL Relational' : 'In-Memory Relational Engine',
      services: servicesHealth
    });
  };

  getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const logs = await this.auditService.getAllLogs();
      res.status(HTTP_STATUS.OK).json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // RESET DE DATOS DE DEMOSTRACIÓN (Para el evaluador)
  // ----------------------------------------------------
  resetDemoData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await seedDatabase(this.repos);
      res.status(HTTP_STATUS.OK).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  };
}
