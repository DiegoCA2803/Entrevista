import { Request, Response, NextFunction } from 'express';
import { EquipmentService } from '../services/equipment.service.js';
import { OperatorService } from '../services/operator.service.js';
import { ShiftService } from '../services/shift.service.js';
import { MaintenanceService } from '../services/maintenance.service.js';
import { ProjectionService } from '../services/projection.service.js';
import { AuditService } from '../services/audit.service.js';
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
      await this.auditService.log({
        action: 'EQUIPMENT_REGISTERED',
        entity_type: 'EQUIPMENT',
        entity_id: eq.id,
        performed_by: res.locals.user.email,
        details: { code: eq.code, type: eq.type, horometer: eq.horometer }
      });
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
      await this.auditService.log({
        action: 'OPERATOR_REGISTERED',
        entity_type: 'OPERATOR',
        entity_id: op.id,
        performed_by: res.locals.user.email,
        details: { code: op.code }
      });
      res.status(HTTP_STATUS.CREATED).json({ success: true, data: op });
    } catch (err) {
      next(err);
    }
  };

  addCertification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cert = await this.operatorService.addCertification({
        ...req.body,
        operator_id: String(req.params.id)
      });
      await this.auditService.log({
        action: 'CERTIFICATION_REGISTERED',
        entity_type: 'OPERATOR',
        entity_id: cert.operator_id,
        performed_by: res.locals.user.email,
        details: { equipment_type: cert.equipment_type, expiration_date: cert.expiration_date }
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
      const shift = await this.shiftService.createDetailedShift(req.body, res.locals.user.email);
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
        performed_by: res.locals.user.email,
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
        closed_by: res.locals.user.email,
        notes
      });

      res.status(HTTP_STATUS.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  // ----------------------------------------------------
  // MANTENIMIENTO
  cancelAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.shiftService.cancelAssignment(
        String(req.params.id),
        String(req.params.assignmentId),
        req.body.reason,
        res.locals.user.email
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };
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
      const result = await this.maintenanceService.registerMaintenance({
        ...req.body,
        performed_by: res.locals.user.email
      });
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
  getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const logs = await this.auditService.getAllLogs();
      res.status(HTTP_STATUS.OK).json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  };
}
