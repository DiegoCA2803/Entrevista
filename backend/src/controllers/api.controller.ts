import { Request, Response } from 'express';
import { EquipmentService } from '../services/equipment.service.js';
import { OperatorService } from '../services/operator.service.js';
import { ShiftService } from '../services/shift.service.js';
import { MaintenanceService } from '../services/maintenance.service.js';
import { ProjectionService } from '../services/projection.service.js';
import { AuditService } from '../services/audit.service.js';
import { ResilientExecutor } from '../resilience/resilient-executor.js';
import { seedDatabase } from '../seeds/seed.js';
import { AppRepositories } from '../repositories/db.js';

export class ApiController {
  constructor(
    private equipmentService: EquipmentService,
    private operatorService: OperatorService,
    private shiftService: ShiftService,
    private maintenanceService: MaintenanceService,
    private projectionService: ProjectionService,
    private auditService: AuditService,
    private repos: AppRepositories
  ) {}

  // ----------------------------------------------------
  // EQUIPOS
  // ----------------------------------------------------
  getAllEquipment = async (req: Request, res: Response) => {
    try {
      const equipment = await this.equipmentService.getAllEquipment();
      return res.json({ success: true, data: equipment });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  getEquipmentById = async (req: Request, res: Response) => {
    try {
      const eq = await this.equipmentService.getEquipmentById(String(req.params.id));
      if (!eq) return res.status(404).json({ success: false, error: 'Equipo no encontrado' });
      return res.json({ success: true, data: eq });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  createEquipment = async (req: Request, res: Response) => {
    try {
      const eq = await this.equipmentService.createEquipment(req.body);
      return res.status(201).json({ success: true, data: eq });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  // ----------------------------------------------------
  // OPERADORES
  // ----------------------------------------------------
  getAllOperators = async (req: Request, res: Response) => {
    try {
      const operators = await this.operatorService.getAllOperators();
      return res.json({ success: true, data: operators });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  createOperator = async (req: Request, res: Response) => {
    try {
      const op = await this.operatorService.createOperator(req.body);
      return res.status(201).json({ success: true, data: op });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  addCertification = async (req: Request, res: Response) => {
    try {
      const cert = await this.operatorService.addCertification({
        operator_id: String(req.params.id),
        ...req.body
      });
      return res.status(201).json({ success: true, data: cert });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  // ----------------------------------------------------
  // TURNOS Y ASIGNACIONES
  // ----------------------------------------------------
  getAllShifts = async (req: Request, res: Response) => {
    try {
      const shifts = await this.shiftService.getAllShifts();
      return res.json({ success: true, data: shifts });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  getShiftById = async (req: Request, res: Response) => {
    try {
      const shift = await this.shiftService.getShiftById(String(req.params.id));
      if (!shift) return res.status(404).json({ success: false, error: 'Turno no encontrado' });
      return res.json({ success: true, data: shift });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  createShift = async (req: Request, res: Response) => {
    try {
      const shift = await this.shiftService.createShift(req.body);
      return res.status(201).json({ success: true, data: shift });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  /**
   * Endpoint de pre-validación de asignaciones (Regla 11)
   * Devuelve TODAS las razones de incumplimiento sin persistir cambios.
   */
  validateAssignment = async (req: Request, res: Response) => {
    try {
      const { equipment_id, operator_id } = req.body;
      const shiftId = String(req.params.id);
      const validation = await this.shiftService.validateAssignment(shiftId, equipment_id, operator_id);
      return res.json({ success: true, data: validation });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  /**
   * Endpoint de creación de asignación.
   * Maneja excepciones de supervisor y garantía de concurrencia.
   */
  createAssignment = async (req: Request, res: Response) => {
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

      return res.status(201).json({ success: true, data: assignment });
    } catch (err: any) {
      // Si fue una colisión de concurrencia o unicidad
      if (err.message.includes('unicidad') || err.message.includes('duplicate') || err.message.includes('uq_')) {
        return res.status(409).json({
          success: false,
          error: 'Conflicto de concurrencia: El recurso ya fue asignado en este turno.',
          detail: err.message
        });
      }

      return res.status(422).json({
        success: false,
        error: err.message
      });
    }
  };

  /**
   * Cierre de turno (Regla 10 y Decisión 1)
   */
  closeShift = async (req: Request, res: Response) => {
    try {
      const { actual_duration_hours, closed_by, notes } = req.body;
      const shiftId = String(req.params.id);

      const result = await this.shiftService.closeShift({
        shift_id: shiftId,
        actual_duration_hours,
        closed_by,
        notes
      });

      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  // ----------------------------------------------------
  // MANTENIMIENTO
  // ----------------------------------------------------
  getAllMaintenance = async (req: Request, res: Response) => {
    try {
      const records = await this.maintenanceService.getAllMaintenanceRecords();
      return res.json({ success: true, data: records });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  registerMaintenance = async (req: Request, res: Response) => {
    try {
      const result = await this.maintenanceService.registerMaintenance(req.body);
      return res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message });
    }
  };

  // ----------------------------------------------------
  // PROYECCIÓN A 7 DÍAS (Regla 12 + Degradación Elegante)
  // ----------------------------------------------------
  get7DayProjection = async (req: Request, res: Response) => {
    try {
      const referenceDate = req.query.reference_date as string | undefined;
      const result = await this.projectionService.get7DayMaintenanceProjection(referenceDate);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  // ----------------------------------------------------
  // AUDITORÍA Y SALUD DEL SISTEMA (SOA Healthcheck)
  // ----------------------------------------------------
  getHealth = async (req: Request, res: Response) => {
    const servicesHealth = ResilientExecutor.getServicesHealth();
    return res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      architecture: 'Layered + SOA with Graceful Degradation',
      database: this.repos.isPostgres ? 'PostgreSQL Relational' : 'In-Memory Relational Engine',
      services: servicesHealth
    });
  };

  getAuditLogs = async (req: Request, res: Response) => {
    try {
      const logs = await this.auditService.getAllLogs();
      return res.json({ success: true, data: logs });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  // ----------------------------------------------------
  // RESET DE DATOS DE DEMOSTRACIÓN (Para el evaluador)
  // ----------------------------------------------------
  resetDemoData = async (req: Request, res: Response) => {
    try {
      const result = await seedDatabase(this.repos);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  };
}
