import { describe, it, expect, beforeEach } from 'vitest';
import { resetRepositoriesForTesting } from '../repositories/db.js';
import { EquipmentService } from '../services/equipment.service.js';
import { OperatorService } from '../services/operator.service.js';
import { ShiftService } from '../services/shift.service.js';
import { MaintenanceService } from '../services/maintenance.service.js';
import { ProjectionService } from '../services/projection.service.js';
import { AuditService } from '../services/audit.service.js';
import { bootstrapContainer } from '../core/container/bootstrap.js';
import { TOKENS } from '../core/container/container.js';

describe('Reglas de Negocio - Control de Flota Minera', () => {
  let repos: ReturnType<typeof resetRepositoriesForTesting>;
  let equipmentService: EquipmentService;
  let operatorService: OperatorService;
  let shiftService: ShiftService;
  let maintenanceService: MaintenanceService;
  let projectionService: ProjectionService;
  let auditService: AuditService;

  beforeEach(async () => {
    repos = resetRepositoriesForTesting();
    // Resolución de dependencias mediante el contenedor IoC (DIP / Clean Code)
    const container = await bootstrapContainer(repos);
    auditService = container.resolve<AuditService>(TOKENS.AuditService);
    equipmentService = container.resolve<EquipmentService>(TOKENS.EquipmentService);
    operatorService = container.resolve<OperatorService>(TOKENS.OperatorService);
    shiftService = container.resolve<ShiftService>(TOKENS.ShiftService);
    maintenanceService = container.resolve<MaintenanceService>(TOKENS.MaintenanceService);
    projectionService = container.resolve<ProjectionService>(TOKENS.ProjectionService);
  });

  // ----------------------------------------------------
  // REGLAS 1 Y 2: Equipos, Horómetro e Intervalo de Mantenimiento
  // ----------------------------------------------------
  it('Regla 1 y 2: Bloquea automáticamente un equipo cuando su horómetro alcanza el intervalo', async () => {
    // Equipo con intervalo de 250h e inicial 240h
    const eq = await equipmentService.createEquipment({
      code: 'CAM-100',
      name: 'Camión Caterpillar 797F',
      type: 'CAMION_ACARREO',
      horometer: 240,
      maintenance_interval_hours: 250,
      last_maintenance_horometer: 0
    });

    expect(eq.status).toBe('DISPONIBLE');

    // Sumar 15 horas de trabajo (240 + 15 = 255 >= 250)
    const { equipment: updated, newlyBlocked } = await equipmentService.addWorkedHours(eq.id, 15);

    expect(updated.horometer).toBe(255);
    expect(updated.status).toBe('BLOQUEADO');
    expect(newlyBlocked).toBe(true);
  });

  // ----------------------------------------------------
  // REGLA 3: Registro de Mantenimiento y Recálculo de Ciclo (Decisión 3)
  // ----------------------------------------------------
  it('Regla 3: Registrar mantenimiento libera el equipo y reinicia el ciclo desde el horómetro REAL', async () => {
    // El mantenimiento se hace a las 280h (30h después del umbral de 250h)
    const eq = await equipmentService.createEquipment({
      code: 'EXC-200',
      name: 'Excavadora Komatsu PC4000',
      type: 'EXCAVADORA',
      horometer: 280,
      maintenance_interval_hours: 250,
      last_maintenance_horometer: 0
    });

    expect(eq.status).toBe('BLOQUEADO');

    // Registrar mantenimiento
    const { equipment: released, record } = await maintenanceService.registerMaintenance({
      equipment_id: eq.id,
      performed_by: 'Ing. Javier Soto - Taller Principal',
      notes: 'Overhaul preventivo PM-250 completado a 280h con cambio de filtros y aceite motor.'
    });

    // Estado liberado a DISPONIBLE
    expect(released.status).toBe('DISPONIBLE');
    // El nuevo ciclo cuenta desde el horómetro real (280h), no desde 250h
    expect(released.last_maintenance_horometer).toBe(280);
    expect(record.horometer_at_maintenance).toBe(280);

    // Próximo bloqueo ocurrirá a 280 + 250 = 530h
    const { equipment: testUsage } = await equipmentService.addWorkedHours(eq.id, 240); // 280 + 240 = 520 < 530
    expect(testUsage.status).toBe('DISPONIBLE');

    const { equipment: testBlock } = await equipmentService.addWorkedHours(eq.id, 15); // 520 + 15 = 535 >= 530
    expect(testBlock.status).toBe('BLOQUEADO');
  });

  // ----------------------------------------------------
  // REGLA 4 Y 9: Certificaciones de Operadores por Fecha de Turno
  // ----------------------------------------------------
  it('Regla 4 y 9: Rechaza asignación si la certificación del operador está vencida en la fecha del turno', async () => {
    const eq = await equipmentService.createEquipment({
      code: 'PRF-300',
      name: 'Perforadora Sandvik',
      type: 'PERFORADORA',
      horometer: 50,
      maintenance_interval_hours: 250
    });

    const op = await operatorService.createOperator({
      code: 'OP-10',
      name: 'Manuel Gomez',
      document_id: '44556677'
    });

    // Certificación vencida el 2026-08-01
    await operatorService.addCertification({
      operator_id: op.id,
      equipment_type: 'PERFORADORA',
      issued_date: '2025-01-01',
      expiration_date: '2026-08-01'
    });

    // Turno programado para 2026-08-15 (posterior al vencimiento)
    const shift = await shiftService.createShift({
      date: '2026-08-15',
      period: 'DIA',
      planned_duration_hours: 8
    });

    const validation = await shiftService.validateAssignment(shift.id, eq.id, op.id);

    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('REGLA 9'))).toBe(true);
    expect(validation.errors.some(e => e.includes('venció el 2026-08-01'))).toBe(true);
  });

  // ----------------------------------------------------
  // REGLAS 6 Y 7: Unicidad y Concurrencia por Turno
  // ----------------------------------------------------
  it('Reglas 6 y 7: Impide asignar dos veces al mismo operador o al mismo equipo en el mismo turno', async () => {
    const eq1 = await equipmentService.createEquipment({
      code: 'CAM-01',
      name: 'Camión 1',
      type: 'CAMION_ACARREO',
      horometer: 50
    });

    const eq2 = await equipmentService.createEquipment({
      code: 'CAM-02',
      name: 'Camión 2',
      type: 'CAMION_ACARREO',
      horometer: 60
    });

    const op1 = await operatorService.createOperator({
      code: 'OP-01',
      name: 'Pedro Rios',
      document_id: '12345678'
    });

    const op2 = await operatorService.createOperator({
      code: 'OP-02',
      name: 'Juan Perez',
      document_id: '87654321'
    });

    await operatorService.addCertification({
      operator_id: op1.id,
      equipment_type: 'CAMION_ACARREO',
      issued_date: '2025-01-01',
      expiration_date: '2027-01-01'
    });

    await operatorService.addCertification({
      operator_id: op2.id,
      equipment_type: 'CAMION_ACARREO',
      issued_date: '2025-01-01',
      expiration_date: '2027-01-01'
    });

    const shift = await shiftService.createShift({
      date: '2026-09-01',
      period: 'DIA',
      planned_duration_hours: 8
    });

    // Primera asignación exitosa: op1 + eq1
    await shiftService.createAssignment({
      shift_id: shift.id,
      equipment_id: eq1.id,
      operator_id: op1.id
    });

    // Intentar asignar eq1 de nuevo (con op2) en el mismo turno -> Rechazado por Regla 7
    const valEq = await shiftService.validateAssignment(shift.id, eq1.id, op2.id);
    expect(valEq.valid).toBe(false);
    expect(valEq.errors.some(e => e.includes('REGLA 7'))).toBe(true);

    // Intentar asignar op1 de nuevo (con eq2) en el mismo turno -> Rechazado por Regla 6
    const valOp = await shiftService.validateAssignment(shift.id, eq2.id, op1.id);
    expect(valOp.valid).toBe(false);
    expect(valOp.errors.some(e => e.includes('REGLA 6'))).toBe(true);
  });

  // ----------------------------------------------------
  // REGLA 11 (CRÍTICA): Muestra TODAS las razones de rechazo acumuladas
  // ----------------------------------------------------
  it('Regla 11: Si una asignación incumple varias reglas a la vez, debe mostrar TODAS, no solo la primera', async () => {
    // 1. Equipo bloqueado por mantenimiento
    const eqBlocked = await equipmentService.createEquipment({
      code: 'EXC-99',
      name: 'Excavadora Bloqueada',
      type: 'EXCAVADORA',
      horometer: 260,
      maintenance_interval_hours: 250,
      last_maintenance_horometer: 0
    });

    // 2. Operador con certificación vencida para Excavadora
    const opExpired = await operatorService.createOperator({
      code: 'OP-99',
      name: 'Operador Con Cert Vencida',
      document_id: '99999999'
    });
    await operatorService.addCertification({
      operator_id: opExpired.id,
      equipment_type: 'EXCAVADORA',
      issued_date: '2024-01-01',
      expiration_date: '2025-01-01'
    });

    // 3. Turno del 2026
    const shift = await shiftService.createShift({
      date: '2026-09-02',
      period: 'DIA',
      planned_duration_hours: 8
    });

    // Validar asignación de equipo bloqueado + operador con certificación vencida
    const validation = await shiftService.validateAssignment(shift.id, eqBlocked.id, opExpired.id);

    expect(validation.valid).toBe(false);
    // Debe contener AL MENOS 2 errores simultáneos (Regla 8 y Regla 9)
    expect(validation.errors.length).toBeGreaterThanOrEqual(2);

    const hasBlockedError = validation.errors.some(e => e.includes('REGLA 8') || e.includes('BLOQUEADO'));
    const hasCertError = validation.errors.some(e => e.includes('REGLA 9') || e.includes('venció'));

    expect(hasBlockedError).toBe(true);
    expect(hasCertError).toBe(true);
  });

  // ----------------------------------------------------
  // REGLA 10: Cierre de Turno y Disparo de Bloqueo en Vivo
  // ----------------------------------------------------
  it('Regla 10: Cerrar turno suma horas reales al horómetro y dispara bloqueo si cruza el umbral', async () => {
    // Equipo a punto de mantenimiento: 245 de 250h (faltan 5h)
    const eq = await equipmentService.createEquipment({
      code: 'CAM-CRITICO',
      name: 'Camión Al Límite',
      type: 'CAMION_ACARREO',
      horometer: 245,
      maintenance_interval_hours: 250,
      last_maintenance_horometer: 0
    });

    const op = await operatorService.createOperator({
      code: 'OP-OK',
      name: 'Operador Certificado',
      document_id: '11223344'
    });
    await operatorService.addCertification({
      operator_id: op.id,
      equipment_type: 'CAMION_ACARREO',
      issued_date: '2025-01-01',
      expiration_date: '2027-01-01'
    });

    const shift = await shiftService.createShift({
      date: '2026-09-03',
      period: 'DIA',
      planned_duration_hours: 8
    });

    await shiftService.createAssignment({
      shift_id: shift.id,
      equipment_id: eq.id,
      operator_id: op.id
    });

    // Turno futuro programado para el día siguiente para probar Decisión 1 (marcar en riesgo)
    const futureShift = await shiftService.createShift({
      date: '2026-09-04',
      period: 'DIA',
      planned_duration_hours: 8
    });
    const futureAssignment = await shiftService.createAssignment({
      shift_id: futureShift.id,
      equipment_id: eq.id,
      operator_id: op.id
    });

    // Cerrar el turno con 8 horas efectivamente trabajadas (245 + 8 = 253 >= 250)
    const closeResult = await shiftService.closeShift({
      shift_id: shift.id,
      actual_duration_hours: 8,
      closed_by: 'Supervisor Juan Valdez',
      notes: 'Turno concluido sin incidencias operativas.'
    });

    expect(closeResult.shift.status).toBe('CERRADO');
    expect(closeResult.blockedEquipment.length).toBe(1);
    expect(closeResult.blockedEquipment[0].code).toBe('CAM-CRITICO');
    expect(closeResult.blockedEquipment[0].horometer).toBe(253);
    expect(closeResult.blockedEquipment[0].status).toBe('BLOQUEADO');

    // Decisión 1: La asignación del turno futuro debe haberse marcado "EN_RIESGO"
    const updatedFutureAssignment = await repos.shiftRepo.findAssignmentById(futureAssignment.id);
    expect(updatedFutureAssignment?.status).toBe('EN_RIESGO');
  });

  // ----------------------------------------------------
  // REGLA 12: Proyección de Mantenimiento a 7 Días
  // ----------------------------------------------------
  it('Regla 12: Proyecta qué equipos alcanzarán mantenimiento en los próximos 7 días según turnos programados', async () => {
    // Equipo con 230h (umbral 250h, faltan 20h)
    const eq = await equipmentService.createEquipment({
      code: 'EXC-PROY',
      name: 'Excavadora Proyección',
      type: 'EXCAVADORA',
      horometer: 230,
      maintenance_interval_hours: 250,
      last_maintenance_horometer: 0
    });

    const op = await operatorService.createOperator({
      code: 'OP-PROY',
      name: 'Operador Proy',
      document_id: '55667788'
    });
    await operatorService.addCertification({
      operator_id: op.id,
      equipment_type: 'EXCAVADORA',
      issued_date: '2025-01-01',
      expiration_date: '2027-01-01'
    });

    // Programar turno 1: +10h (230 + 10 = 240h < 250h)
    const s1 = await shiftService.createShift({
      date: '2026-09-02',
      period: 'DIA',
      planned_duration_hours: 10
    });
    await shiftService.createAssignment({
      shift_id: s1.id,
      equipment_id: eq.id,
      operator_id: op.id
    });

    // Programar turno 2: +12h (240 + 12 = 252h >= 250h) -> ¡Alcanzará mantenimiento aquí!
    const s2 = await shiftService.createShift({
      date: '2026-09-04',
      period: 'NOCHE',
      planned_duration_hours: 12
    });
    await shiftService.createAssignment({
      shift_id: s2.id,
      equipment_id: eq.id,
      operator_id: op.id
    });

    // Ejecutar proyección con fecha base 2026-09-01
    const { projection } = await projectionService.get7DayMaintenanceProjection('2026-09-01');

    const item = projection.find(p => p.equipment_code === 'EXC-PROY');
    expect(item).toBeDefined();
    expect(item?.projected_scheduled_hours_7days).toBe(22);
    expect(item?.projected_total_horometer).toBe(252);
    expect(item?.will_reach_maintenance).toBe(true);
    expect(item?.critical_shift_date).toBe('2026-09-04');
    expect(item?.critical_shift_period).toBe('NOCHE');
  });

  // ----------------------------------------------------
  // DECISIÓN: Excepción con Autorización de Supervisor
  // ----------------------------------------------------
  it('Supervisor Override: Permite forzar asignación bloqueada solo con justificación y auditoría', async () => {
    const eqBlocked = await equipmentService.createEquipment({
      code: 'CAM-OVERRIDE',
      name: 'Camión Bloqueado',
      type: 'CAMION_ACARREO',
      horometer: 255,
      maintenance_interval_hours: 250,
      last_maintenance_horometer: 0
    });

    const op = await operatorService.createOperator({
      code: 'OP-AUTO',
      name: 'Operador Acreditado',
      document_id: '99887766'
    });
    await operatorService.addCertification({
      operator_id: op.id,
      equipment_type: 'CAMION_ACARREO',
      issued_date: '2025-01-01',
      expiration_date: '2027-01-01'
    });

    const shift = await shiftService.createShift({
      date: '2026-09-05',
      period: 'DIA',
      planned_duration_hours: 8
    });

    // Sin override debe fallar
    await expect(
      shiftService.createAssignment({
        shift_id: shift.id,
        equipment_id: eqBlocked.id,
        operator_id: op.id,
        is_override: false
      })
    ).rejects.toThrow();

    // Con override válido y justificación de supervisor
    const forcedAssignment = await shiftService.createAssignment({
      shift_id: shift.id,
      equipment_id: eqBlocked.id,
      operator_id: op.id,
      is_override: true,
      override_by: 'SUPERVISOR_GUARDIA_01',
      override_reason: 'Emergencia en rampa de acarreo por desprendimiento. Autorizado por Jefatura.'
    });

    expect(forcedAssignment.is_override).toBe(true);
    expect(forcedAssignment.override_by).toBe('SUPERVISOR_GUARDIA_01');
    expect(forcedAssignment.override_reason).toContain('Emergencia');

    // Verificar que quedó registrado en logs de auditoría
    const logs = await auditService.getAllLogs();
    const overrideLog = logs.find(l => l.action === 'SUPERVISOR_OVERRIDE_ASSIGNMENT');
    expect(overrideLog).toBeDefined();
    expect(overrideLog?.performed_by).toBe('SUPERVISOR_GUARDIA_01');
  });
});
