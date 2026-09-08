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
import {
  NotFoundError,
  ValidationError,
  BusinessRuleViolationError,
  ConflictError
} from '../core/errors/app-error.js';
import { BUSINESS_RULES_CONFIG } from '../core/constants/index.js';
import { shiftLastDate, shiftWindow } from '../domain/time.js';

export class ShiftService {
  constructor(
    private readonly shiftRepo: IShiftRepository,
    private readonly equipmentRepo: IEquipmentRepository,
    private readonly operatorRepo: IOperatorRepository,
    private readonly operatorService: OperatorService,
    private readonly equipmentService: EquipmentService,
    private readonly auditService?: AuditService
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
    const plannedHours = data.planned_duration_hours ?? BUSINESS_RULES_CONFIG.DEFAULT_SHIFT_DURATION_HOURS;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !['DIA', 'NOCHE'].includes(data.period) ||
      !Number.isFinite(plannedHours)
    )
      throw new ValidationError('Fecha, jornada o duración inválidas.');
    if (
      plannedHours < BUSINESS_RULES_CONFIG.MIN_SHIFT_DURATION_HOURS ||
      plannedHours > BUSINESS_RULES_CONFIG.MAX_SHIFT_DURATION_HOURS
    ) {
      throw new ValidationError(
        `La duración planificada del turno debe estar entre ${BUSINESS_RULES_CONFIG.MIN_SHIFT_DURATION_HOURS} y ${BUSINESS_RULES_CONFIG.MAX_SHIFT_DURATION_HOURS} horas.`
      );
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
    operatorId: string,
    draft?: Shift,
    ignoreOwnAssignment = false
  ): Promise<AssignmentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validar existencia y estado del turno
    const shift = draft || (await this.shiftRepo.findById(shiftId));
    if (!shift) {
      errors.push(`El turno con ID ${shiftId} no existe.`);
      return { valid: false, errors, warnings, can_override: false };
    }

    if (shift.status === 'CERRADO') {
      errors.push(
        `El turno ${shift.code} (${shift.date}) ya está CERRADO. No se permiten nuevas asignaciones.`
      );
    } else if (shift.status === 'CANCELADO') {
      errors.push(`El turno ${shift.code} está CANCELADO.`);
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
      if (existingEquipmentAssignment && !ignoreOwnAssignment) {
        errors.push(
          `REGLA 7: El equipo ${equipment.code} ya está asignado en este mismo turno (${shift.code}). No puede duplicarse la asignación en el mismo turno.`
        );
      }
    }

    // 3. Validar Operador
    const operator = await this.operatorRepo.findById(operatorId);
    if (!operator) {
      errors.push(`El operador con ID ${operatorId} no existe.`);
    } else {
      if (!operator.is_active) {
        errors.push(
          `El operador ${operator.name} (${operator.code}) está inactivo en la plantilla de personal.`
        );
      }

      // Regla 6: Un operador no puede tener dos asignaciones en el mismo turno
      const existingOperatorAssignment = await this.shiftRepo.findAssignmentByShiftAndOperator(
        shiftId,
        operatorId
      );
      if (existingOperatorAssignment && !ignoreOwnAssignment) {
        errors.push(
          `REGLA 6: El operador ${operator.name} (${operator.code}) ya tiene otra asignación activa en este mismo turno (${shift.code}). Un operador no puede operar dos equipos simultáneamente.`
        );
      }

      // Regla 9: No se puede asignar un operador sin certificación vigente para ese tipo de equipo en esa fecha
      if (equipment) {
        const certResult = await this.operatorService.validateCertificationForShift(
          operatorId,
          equipment.type,
          shift.date,
          shiftLastDate(shift.date, shift.period, shift.planned_duration_hours)
        );

        if (!certResult.isValid) {
          errors.push(`REGLA 9: ${certResult.reason}`);
        }
      }
    }

    const currentWindow = shiftWindow(shift.date, shift.period, shift.planned_duration_hours);
    for (const other of await this.shiftRepo.findAll()) {
      if (other.id === shiftId || other.status === 'CANCELADO') continue;
      const duration =
        other.status === 'CERRADO' ? (other.actual_duration_hours ?? 0) : other.planned_duration_hours;
      const window = shiftWindow(other.date, other.period, duration);
      if (currentWindow.start >= window.end || window.start >= currentWindow.end) continue;
      if (other.assignments?.some((a) => a.status !== 'CANCELADA' && a.equipment_id === equipmentId))
        errors.push(`El equipo ya está asignado al turno ${other.code}, cuyo horario se superpone.`);
      if (other.assignments?.some((a) => a.status !== 'CANCELADA' && a.operator_id === operatorId))
        errors.push(`El operador ya está asignado al turno ${other.code}, cuyo horario se superpone.`);
    }
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      can_override: false
    };
  }

  /**
   * Crea una asignación evaluando todas las reglas.
   * Las reglas de seguridad se aplican también a supervisores.
   */
  async createAssignment(data: {
    shift_id: string;
    equipment_id: string;
    operator_id: string;
    is_override?: boolean;
    override_by?: string;
    override_reason?: string;
    performed_by?: string;
  }): Promise<Assignment> {
    const validation = await this.validateAssignment(data.shift_id, data.equipment_id, data.operator_id);
    if (data.is_override)
      throw new BusinessRuleViolationError(
        'Las reglas de seguridad no admiten excepciones de supervisor.',
        validation.errors.length ? validation.errors : ['No se permiten asignaciones forzadas.']
      );

    if (!validation.valid) throw new BusinessRuleViolationError('Asignación rechazada.', validation.errors);

    const assignment = await this.shiftRepo.createAssignment({
      shift_id: data.shift_id,
      equipment_id: data.equipment_id,
      operator_id: data.operator_id,
      status: 'PROGRAMADA',
      is_override: false,
      override_by: null,
      override_reason: null,
      override_at: null
    });

    await this.auditService?.log({
      action: 'ASSIGNMENT_CREATED',
      entity_type: 'ASSIGNMENT',
      entity_id: assignment.id,
      performed_by: data.performed_by || 'SYSTEM',
      details: { shift_id: data.shift_id, equipment_id: data.equipment_id, operator_id: data.operator_id }
    });

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
      throw new NotFoundError('Turno minero', data.shift_id);
    }

    if (shift.status === 'CERRADO' || shift.status === 'CANCELADO') {
      throw new ConflictError(`El turno ${shift.code} ya se encuentra cerrado o cancelado.`);
    }

    const actualHours = Number(data.actual_duration_hours);
    if (
      !Number.isFinite(actualHours) ||
      actualHours < 0 ||
      actualHours > BUSINESS_RULES_CONFIG.MAX_SHIFT_DURATION_HOURS
    ) {
      throw new ValidationError(
        `Las horas efectivamente trabajadas deben ser un número entre 0 y ${BUSINESS_RULES_CONFIG.MAX_SHIFT_DURATION_HOURS}.`
      );
    }

    if (!data.closed_by || data.closed_by.trim().length === 0) {
      throw new ValidationError('Debe indicarse el responsable del cierre de turno.');
    }

    // 1. Obtener todas las asignaciones del turno
    const assignments = await this.shiftRepo.findAssignmentsByShiftId(data.shift_id);
    const activeAssignments = assignments.filter((a) => a.status !== 'CANCELADA');
    const violations: string[] = [];
    if (actualHours > 0) {
      for (const assignment of activeAssignments) {
        const result = await this.validateAssignment(
          shift.id,
          assignment.equipment_id,
          assignment.operator_id,
          { ...shift, planned_duration_hours: actualHours },
          true
        );
        violations.push(...result.errors);
      }
    }
    if (violations.length)
      throw new BusinessRuleViolationError(
        'No se puede cerrar el turno con recursos no habilitados. Registra el mantenimiento o corrige las asignaciones.',
        violations
      );

    const affectedEquipment: Equipment[] = [];
    const blockedEquipment: Equipment[] = [];
    let flaggedUpcomingCount = 0;

    // 2. Por cada equipo asignado, sumar las horas trabajadas al horómetro
    for (const assignment of activeAssignments) {
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
        const upcoming = await this.shiftRepo.findUpcomingAssignmentsForEquipment(equipment.id, shift.date);

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
          blocked_codes: blockedEquipment.map((e) => e.code),
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

  async createDetailedShift(
    data: {
      date: string;
      period: ShiftPeriod;
      planned_duration_hours: number;
      notes?: string;
      assignments: Array<{ equipment_id: string; operator_id: string }>;
    },
    actor: string
  ): Promise<Shift> {
    const code = `TUR-${data.date}-${data.period[0]}`;
    if (await this.shiftRepo.findByCode(code))
      throw new ConflictError('Ya existe un turno para esta fecha y jornada.');
    const draft: Shift = {
      id: 'new',
      code,
      date: data.date,
      period: data.period,
      planned_duration_hours: data.planned_duration_hours,
      status: 'PROGRAMADO',
      notes: data.notes
    };
    const errors: string[] = [];
    const equipment = new Set<string>();
    const operators = new Set<string>();
    if (!data.assignments?.length)
      throw new ValidationError('Agrega al menos una pareja de equipo y operador.');
    for (const [index, pair] of data.assignments.entries()) {
      const result = await this.validateAssignment('new', pair.equipment_id, pair.operator_id, draft);
      errors.push(...result.errors.map((e) => `Asignación ${index + 1}: ${e}`));
      if (equipment.has(pair.equipment_id))
        errors.push(`Asignación ${index + 1}: equipo repetido en el formulario.`);
      if (operators.has(pair.operator_id))
        errors.push(`Asignación ${index + 1}: operador repetido en el formulario.`);
      equipment.add(pair.equipment_id);
      operators.add(pair.operator_id);
    }
    if (errors.length)
      throw new BusinessRuleViolationError('Revisa las asignaciones. No se guardó ningún cambio.', errors);
    const shift = await this.createShift(data);
    for (const pair of data.assignments)
      await this.createAssignment({ ...pair, shift_id: shift.id, performed_by: actor });
    await this.auditService?.log({
      action: 'SHIFT_SCHEDULED',
      entity_type: 'SHIFT',
      entity_id: shift.id,
      performed_by: actor,
      details: { code, assignments: data.assignments.length, notes: data.notes || '' }
    });
    return (await this.shiftRepo.findById(shift.id))!;
  }

  async cancelAssignment(shiftId: string, assignmentId: string, reason: string, actor: string) {
    const assignment = await this.shiftRepo.findAssignmentById(assignmentId);
    const shift = await this.shiftRepo.findById(shiftId);
    if (!assignment || assignment.shift_id !== shiftId || !shift)
      throw new NotFoundError('Asignación', assignmentId);
    if (
      shift.status === 'CERRADO' ||
      shift.status === 'CANCELADO' ||
      !['PROGRAMADA', 'EN_RIESGO'].includes(assignment.status)
    )
      throw new ConflictError('Solo pueden cancelarse asignaciones pendientes de un turno abierto.');
    const result = await this.shiftRepo.updateAssignmentStatus(assignmentId, 'CANCELADA', reason);
    await this.auditService?.log({
      action: 'ASSIGNMENT_CANCELLED',
      entity_type: 'ASSIGNMENT',
      entity_id: assignmentId,
      performed_by: actor,
      details: { shift_id: shiftId, reason }
    });
    return result;
  }
}
