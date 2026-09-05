import {
  Shift,
  Assignment,
  ShiftPeriod,
  ShiftStatus,
  AssignmentValidationResult,
  Equipment,
  AssignmentStatus
} from '../domain/types.js';
import { IShiftRepository, IEquipmentRepository, IOperatorRepository } from '../repositories/interfaces.js';
import { OperatorService } from './operator.service.js';
import { EquipmentService } from './equipment.service.js';
import { AuditService } from './audit.service.js';

export class ShiftService {
  constructor(
    private shiftRepo: IShiftRepository,
    private equipmentRepo: IEquipmentRepository,
    private operatorRepo: IOperatorRepository,
    private operatorService: OperatorService,
    private equipmentService: EquipmentService,
    private auditService?: AuditService
  ) {}

  async getAllShifts(): Promise<Shift[]> {
    return this.shiftRepo.findAll();
  }

  async getShiftById(id: string): Promise<Shift | null> {
    return this.shiftRepo.findById(id);
  }

  async getShiftsByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    return this.shiftRepo.findByDateRange(startDate, endDate);
  }

  async createShift(data: {
    date: string;
    period: ShiftPeriod;
    planned_duration_hours?: number;
    notes?: string;
  }): Promise<Shift> {
    const plannedHours = data.planned_duration_hours ?? 8;
    if (plannedHours <= 0 || plannedHours > 24) {
      throw new Error('La duración planificada del turno debe estar entre 1 y 24 horas.');
    }

    const code = `TUR-${data.date}-${data.period.substring(0, 1).toUpperCase()}`;

    return this.shiftRepo.create({
      code,
      date: data.date,
      period: data.period,
      planned_duration_hours: plannedHours,
      status: 'PROGRAMADO',
      notes: data.notes || null
    });
  }

  /**
   * REGLA 11 (OBLIGATORIA):
   * Valida exhaustivamente una asignación y retorna TODAS las causas de rechazo
   * simultáneamente si incumple más de una regla.
   */
  async validateAssignment(
    shiftId: string,
    equipmentId: string,
    operatorId: string
  ): Promise<AssignmentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let canOverride = true;

    // 1. Validar existencia y estado del turno
    const shift = await this.shiftRepo.findById(shiftId);
    if (!shift) {
      errors.push(`El turno con ID ${shiftId} no existe.`);
      return { valid: false, errors, warnings, can_override: false };
    }

    if (shift.status === 'CERRADO') {
      errors.push(`El turno ${shift.code} (${shift.date}) ya está CERRADO. No se permiten nuevas asignaciones.`);
      canOverride = false;
    } else if (shift.status === 'CANCELADO') {
      errors.push(`El turno ${shift.code} está CANCELADO.`);
      canOverride = false;
    }

    // 2. Validar Equipo
    const equipment = await this.equipmentRepo.findById(equipmentId);
    if (!equipment) {
      errors.push(`El equipo con ID ${equipmentId} no existe.`);
    } else {
      // Regla 8: No se puede asignar un equipo bloqueado o en mantenimiento
      const nextThreshold = equipment.last_maintenance_horometer + equipment.maintenance_interval_hours;
      const hoursUntilPm = nextThreshold - equipment.horometer;

      if (equipment.status === 'BLOQUEADO') {
        errors.push(
          `REGLA 8: El equipo ${equipment.code} (${equipment.name}) está BLOQUEADO por haber superado su umbral de mantenimiento (${equipment.horometer}h / ${nextThreshold}h). Debe registrarse su mantenimiento antes de asignarlo.`
        );
      } else if (equipment.status === 'EN_MANTENIMIENTO') {
        errors.push(
          `REGLA 8: El equipo ${equipment.code} (${equipment.name}) se encuentra actualmente en taller bajo mantenimiento activo.`
        );
      } else if (equipment.horometer >= nextThreshold) {
        errors.push(
          `REGLA 2/8: El equipo ${equipment.code} alcanzó el límite de mantenimiento (${equipment.horometer}h >= ${nextThreshold}h) y requiere bloqueo inmediato.`
        );
      } else if (hoursUntilPm < shift.planned_duration_hours) {
        warnings.push(
          `ADVERTENCIA DE PROYECCIÓN: Al equipo ${equipment.code} le restan solo ${hoursUntilPm.toFixed(1)}h para mantenimiento y este turno planifica ${shift.planned_duration_hours}h. Se bloqueará durante este turno.`
        );
      }

      // Regla 7: Un equipo no puede estar asignado dos veces en el mismo turno
      const existingEquipmentAssignment = await this.shiftRepo.findAssignmentByShiftAndEquipment(
        shiftId,
        equipmentId
      );
      if (existingEquipmentAssignment) {
        errors.push(
          `REGLA 7: El equipo ${equipment.code} ya está asignado en este mismo turno (${shift.code}). No puede duplicarse la asignación en el mismo turno.`
        );
        canOverride = false; // Duplicación física imposible en el mismo turno
      }
    }

    // 3. Validar Operador
    const operator = await this.operatorRepo.findById(operatorId);
    if (!operator) {
      errors.push(`El operador con ID ${operatorId} no existe.`);
    } else {
      if (!operator.is_active) {
        errors.push(`El operador ${operator.name} (${operator.code}) está inactivo en la plantilla de personal.`);
      }

      // Regla 6: Un operador no puede tener dos asignaciones en el mismo turno
      const existingOperatorAssignment = await this.shiftRepo.findAssignmentByShiftAndOperator(
        shiftId,
        operatorId
      );
      if (existingOperatorAssignment) {
        errors.push(
          `REGLA 6: El operador ${operator.name} (${operator.code}) ya tiene otra asignación activa en este mismo turno (${shift.code}). Un operador no puede operar dos equipos simultáneamente.`
        );
        canOverride = false; // No es posible clonar al operador
      }

      // Regla 9: No se puede asignar un operador sin certificación vigente para ese tipo de equipo en esa fecha
      if (equipment) {
        const certResult = await this.operatorService.validateCertificationForShift(
          operatorId,
          equipment.type,
          shift.date
        );

        if (!certResult.isValid) {
          errors.push(`REGLA 9: ${certResult.reason}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      can_override: canOverride && errors.length > 0
    };
  }

  /**
   * Crea una asignación evaluando todas las reglas.
   * Si hay errores pero se autoriza excepción con justificación de supervisor,
   * se guarda con trazabilidad de override.
   */
  async createAssignment(data: {
    shift_id: string;
    equipment_id: string;
    operator_id: string;
    is_override?: boolean;
    override_by?: string;
    override_reason?: string;
  }): Promise<Assignment> {
    const validation = await this.validateAssignment(
      data.shift_id,
      data.equipment_id,
      data.operator_id
    );

    if (!validation.valid) {
      if (data.is_override) {
        if (!validation.can_override) {
          throw new Error(
            `No se puede forzar la asignación debido a colisión física de recursos:\n- ${validation.errors.join('\n- ')}`
          );
        }

        if (!data.override_by || data.override_by.trim().length === 0) {
          throw new Error('Para forzar una asignación es obligatorio indicar el usuario/código del supervisor autorizante.');
        }

        if (!data.override_reason || data.override_reason.trim().length < 10) {
          throw new Error('La justificación de la excepción de supervisor debe contener al menos 10 caracteres explicativos.');
        }
      } else {
        // Devolver TODAS las violaciones juntas
        throw new Error(
          `Asignación rechazada por incumplir ${validation.errors.length} regla(s) de negocio:\n- ${validation.errors.join('\n- ')}`
        );
      }
    }

    const assignment = await this.shiftRepo.createAssignment({
      shift_id: data.shift_id,
      equipment_id: data.equipment_id,
      operator_id: data.operator_id,
      status: 'PROGRAMADA',
      is_override: !!data.is_override,
      override_by: data.override_by ? data.override_by.trim() : null,
      override_reason: data.override_reason ? data.override_reason.trim() : null,
      override_at: data.is_override ? new Date().toISOString() : null
    });

    if (data.is_override && this.auditService) {
      await this.auditService.log({
        action: 'SUPERVISOR_OVERRIDE_ASSIGNMENT',
        entity_type: 'ASSIGNMENT',
        entity_id: assignment.id,
        details: {
          shift_id: data.shift_id,
          equipment_id: data.equipment_id,
          operator_id: data.operator_id,
          override_by: data.override_by,
          override_reason: data.override_reason,
          bypassed_rules: validation.errors
        },
        performed_by: data.override_by || 'SUPERVISOR'
      });
    }

    return assignment;
  }

  /**
   * REGLA 10 (OBLIGATORIA):
   * Al cerrar el turno se registran las horas efectivamente trabajadas y se suman
   * al horómetro del equipo. Eso puede dispararle el bloqueo por mantenimiento.
   *
   * DECISIÓN 1: Si un equipo se bloquea a mitad de semana y ya tenía turnos programados
   * para los días siguientes, esas asignaciones se marcan automáticamente como "EN RIESGO"
   * y se levanta alerta para que el despachador reasigne o programe PM.
   */
  async closeShift(data: {
    shift_id: string;
    actual_duration_hours: number;
    closed_by: string;
    notes?: string;
  }): Promise<{
    shift: Shift;
    affectedEquipment: Equipment[];
    blockedEquipment: Equipment[];
    flaggedUpcomingAssignmentsCount: number;
  }> {
    const shift = await this.shiftRepo.findById(data.shift_id);
    if (!shift) {
      throw new Error(`Turno con ID ${data.shift_id} no encontrado.`);
    }

    if (shift.status === 'CERRADO') {
      throw new Error(`El turno ${shift.code} ya se encuentra cerrado.`);
    }

    const actualHours = Number(data.actual_duration_hours);
    if (isNaN(actualHours) || actualHours < 0 || actualHours > 24) {
      throw new Error('Las horas efectivamente trabajadas deben ser un número entre 0 y 24.');
    }

    if (!data.closed_by || data.closed_by.trim().length === 0) {
      throw new Error('Debe indicarse el responsable del cierre de turno.');
    }

    // 1. Obtener todas las asignaciones del turno
    const assignments = await this.shiftRepo.findAssignmentsByShiftId(data.shift_id);

    const affectedEquipment: Equipment[] = [];
    const blockedEquipment: Equipment[] = [];
    let flaggedUpcomingCount = 0;

    // 2. Por cada equipo asignado, sumar las horas trabajadas al horómetro
    for (const assignment of assignments) {
      const { equipment, newlyBlocked } = await this.equipmentService.addWorkedHours(
        assignment.equipment_id,
        actualHours
      );

      affectedEquipment.push(equipment);

      // Marcar asignación como completada
      await this.shiftRepo.updateAssignmentStatus(assignment.id, 'COMPLETADA');

      // Si el equipo se bloqueó o ya está bloqueado
      if (equipment.status === 'BLOQUEADO' || newlyBlocked) {
        blockedEquipment.push(equipment);

        // DECISIÓN 1: Marcar turnos futuros de este equipo como "EN RIESGO"
        const upcoming = await this.shiftRepo.findUpcomingAssignmentsForEquipment(
          equipment.id,
          shift.date
        );

        for (const upAssignment of upcoming) {
          if (upAssignment.shift_id !== shift.id) {
            await this.shiftRepo.updateAssignmentStatus(
              upAssignment.id,
              'EN_RIESGO',
              `Equipo ${equipment.code} bloqueado por superar umbral en turno ${shift.code} (${equipment.horometer}h). Requiere mantenimiento previo o reasignación.`
            );
            flaggedUpcomingCount++;
          }
        }
      }
    }

    // 3. Cerrar formalmente el turno
    const closedShift = await this.shiftRepo.updateStatus(
      data.shift_id,
      'CERRADO',
      actualHours,
      data.closed_by.trim(),
      data.notes ? data.notes.trim() : undefined
    );

    // 4. Auditoría de cierre
    if (this.auditService) {
      await this.auditService.log({
        action: 'SHIFT_CLOSED',
        entity_type: 'SHIFT',
        entity_id: shift.id,
        details: {
          shift_code: shift.code,
          planned_hours: shift.planned_duration_hours,
          actual_hours: actualHours,
          assignments_count: assignments.length,
          blocked_equipment_count: blockedEquipment.length,
          blocked_codes: blockedEquipment.map(e => e.code),
          flagged_upcoming_count: flaggedUpcomingCount
        },
        performed_by: data.closed_by
      });
    }

    return {
      shift: closedShift,
      affectedEquipment,
      blockedEquipment,
      flaggedUpcomingAssignmentsCount: flaggedUpcomingCount
    };
  }
}
