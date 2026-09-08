import { AppRepositories, getRepositories } from '../repositories/db.js';
import { EquipmentType } from '../domain/types.js';
import { localDate } from '../domain/time.js';

export async function seedDatabase(repos: AppRepositories): Promise<{ message: string; summary: any }> {
  // Clear existing if supported
  if (repos.clearAll) {
    repos.clearAll();
  } else if (repos.isPostgres && repos.getPool) {
    const pool = repos.getPool();
    await pool.query(`
      TRUNCATE TABLE maintenance_records, assignments, shifts, certifications, operators, equipment RESTART IDENTITY CASCADE;
    `);
  }

  const today = localDate();

  // Fechas relativas
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 30);
  const pastDateStr = pastDate.toISOString().split('T')[0];

  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 5);
  const expiredDateStr = expiredDate.toISOString().split('T')[0];

  const futureDate1 = new Date();
  futureDate1.setDate(futureDate1.getDate() + 1);
  const futureDate1Str = futureDate1.toISOString().split('T')[0];

  const futureDate2 = new Date();
  futureDate2.setDate(futureDate2.getDate() + 2);
  const futureDate2Str = futureDate2.toISOString().split('T')[0];

  const futureDate3 = new Date();
  futureDate3.setDate(futureDate3.getDate() + 3);
  const futureDate3Str = futureDate3.toISOString().split('T')[0];

  const futureYear = new Date();
  futureYear.setFullYear(futureYear.getFullYear() + 2);
  const futureYearStr = futureYear.toISOString().split('T')[0];

  // ----------------------------------------------------
  // 1. EQUIPOS DE PRUEBA
  // ----------------------------------------------------
  // CASO BORDE OBLIGATORIO 1: Equipo a punto de alcanzar mantenimiento (246 / 250h -> 4h restantes)
  const eq1 = await repos.equipmentRepo.create({
    code: 'CAM-001',
    name: 'Camión Caterpillar 797F (Frente Norte)',
    type: 'CAMION_ACARREO',
    horometer: 246.0,
    maintenance_interval_hours: 250.0,
    last_maintenance_horometer: 0,
    status: 'DISPONIBLE'
  });

  // Equipo bloqueado previamente por haber superado horas
  const eq2 = await repos.equipmentRepo.create({
    code: 'EXC-101',
    name: 'Excavadora Hidráulica Komatsu PC4000',
    type: 'EXCAVADORA',
    horometer: 512.0,
    maintenance_interval_hours: 250.0,
    last_maintenance_horometer: 250.0,
    status: 'BLOQUEADO'
  });

  // Perforadora disponible con horómetro medio
  const eq3 = await repos.equipmentRepo.create({
    code: 'PRF-201',
    name: 'Perforadora Sandvik DR412i (Banco 4)',
    type: 'PERFORADORA',
    horometer: 110.0,
    maintenance_interval_hours: 250.0,
    last_maintenance_horometer: 0,
    status: 'DISPONIBLE'
  });

  // Camión adicional disponible
  const eq4 = await repos.equipmentRepo.create({
    code: 'CAM-002',
    name: 'Camión Komatsu 930E-4 (Frente Sur)',
    type: 'CAMION_ACARREO',
    horometer: 180.0,
    maintenance_interval_hours: 250.0,
    last_maintenance_horometer: 0,
    status: 'DISPONIBLE'
  });

  // Cargador frontal en taller
  const eq5 = await repos.equipmentRepo.create({
    code: 'CRG-301',
    name: 'Cargador Frontal CAT 994K',
    type: 'CARGADOR_FRONTAL',
    horometer: 250.0,
    maintenance_interval_hours: 250.0,
    last_maintenance_horometer: 0,
    status: 'EN_MANTENIMIENTO'
  });

  // ----------------------------------------------------
  // 2. OPERADORES Y CERTIFICACIONES
  // ----------------------------------------------------
  // Operador 1: Certificación vigente en Camión de Acarreo y Excavadora
  const op1 = await repos.operatorRepo.create({
    code: 'OP-001',
    name: 'Carlos Mendoza Ramos',
    document_id: '45892144',
    is_active: true
  });
  await repos.operatorRepo.addCertification({
    operator_id: op1.id,
    equipment_type: 'CAMION_ACARREO',
    issued_date: pastDateStr,
    expiration_date: futureYearStr,
    institution: 'Tecsup Certificaciones Mineras'
  });
  await repos.operatorRepo.addCertification({
    operator_id: op1.id,
    equipment_type: 'EXCAVADORA',
    issued_date: pastDateStr,
    expiration_date: futureYearStr,
    institution: 'Tecsup Certificaciones Mineras'
  });

  // Operador 2: Certificación vigente solo en Perforadora
  const op2 = await repos.operatorRepo.create({
    code: 'OP-002',
    name: 'Marcos Villegas Sotomayor',
    document_id: '71239841',
    is_active: true
  });
  await repos.operatorRepo.addCertification({
    operator_id: op2.id,
    equipment_type: 'PERFORADORA',
    issued_date: pastDateStr,
    expiration_date: futureYearStr,
    institution: 'Centro de Entrenamiento Minero'
  });

  // CASO BORDE OBLIGATORIO 2: Operador con certificación VENCIDA
  const op3 = await repos.operatorRepo.create({
    code: 'OP-003',
    name: 'Jorge Quispe Huamán',
    document_id: '43901287',
    is_active: true
  });
  await repos.operatorRepo.addCertification({
    operator_id: op3.id,
    equipment_type: 'EXCAVADORA',
    issued_date: '2024-01-10',
    expiration_date: expiredDateStr, // Vencida hace 5 días
    institution: 'Instituto de Formación Técnica'
  });
  await repos.operatorRepo.addCertification({
    operator_id: op3.id,
    equipment_type: 'CAMION_ACARREO',
    issued_date: '2024-01-10',
    expiration_date: expiredDateStr, // Vencida también
    institution: 'Instituto de Formación Técnica'
  });

  // Operador 4: Disponible con vigencia
  const op4 = await repos.operatorRepo.create({
    code: 'OP-004',
    name: 'Ana María Valdivia',
    document_id: '70891234',
    is_active: true
  });
  await repos.operatorRepo.addCertification({
    operator_id: op4.id,
    equipment_type: 'CAMION_ACARREO',
    issued_date: pastDateStr,
    expiration_date: futureYearStr,
    institution: 'Caterpillar Institute'
  });

  // ----------------------------------------------------
  // 3. TURNOS Y ASIGNACIONES (CASOS BORDE)
  // ----------------------------------------------------
  // CASO BORDE OBLIGATORIO 3:
  // Turno de HOY que al cerrarse con 8 horas suma a CAM-001 (246h + 8h = 254h >= 250h)
  // ¡Disparando de forma inmediata el bloqueo por mantenimiento!
  const shiftToday = await repos.shiftRepo.create({
    code: `TUR-${today}-D`,
    date: today,
    period: 'DIA',
    planned_duration_hours: 8.0,
    status: 'PROGRAMADO',
    notes:
      'Turno Día Frente de Carguío Principal. Al cerrar este turno, CAM-001 superará las 250h y se bloqueará automáticamente.'
  });

  // Asignar CAM-001 con Carlos Mendoza (certificación vigente)
  await repos.shiftRepo.createAssignment({
    shift_id: shiftToday.id,
    equipment_id: eq1.id,
    operator_id: op1.id,
    status: 'PROGRAMADA',
    is_override: false
  });

  // Turnos futuros para la Proyección a 7 Días (Regla 12)
  const shiftF1 = await repos.shiftRepo.create({
    code: `TUR-${futureDate1Str}-D`,
    date: futureDate1Str,
    period: 'DIA',
    planned_duration_hours: 10.0,
    status: 'PROGRAMADO',
    notes: 'Turno programado día +1'
  });
  await repos.shiftRepo.createAssignment({
    shift_id: shiftF1.id,
    equipment_id: eq4.id, // CAM-002: 180h + 10h = 190h
    operator_id: op4.id,
    status: 'PROGRAMADA',
    is_override: false
  });

  const shiftF2 = await repos.shiftRepo.create({
    code: `TUR-${futureDate2Str}-D`,
    date: futureDate2Str,
    period: 'DIA',
    planned_duration_hours: 10.0,
    status: 'PROGRAMADO',
    notes: 'Turno programado día +2'
  });
  await repos.shiftRepo.createAssignment({
    shift_id: shiftF2.id,
    equipment_id: eq3.id, // PRF-201: 110h + 10h = 120h
    operator_id: op2.id,
    status: 'PROGRAMADA',
    is_override: false
  });

  const shiftF3 = await repos.shiftRepo.create({
    code: `TUR-${futureDate3Str}-D`,
    date: futureDate3Str,
    period: 'DIA',
    planned_duration_hours: 12.0,
    status: 'PROGRAMADO',
    notes: 'Turno programado día +3 asignado a CAM-001'
  });
  // Asignamos CAM-001 en turno futuro para demostrar cómo pasa a "EN RIESGO" cuando se bloquee hoy
  await repos.shiftRepo.createAssignment({
    shift_id: shiftF3.id,
    equipment_id: eq1.id,
    operator_id: op4.id,
    status: 'PROGRAMADA',
    is_override: false
  });

  // Historial previo de mantenimiento para auditoría
  await repos.maintenanceRepo.create({
    equipment_id: eq2.id,
    date: '2026-08-15T10:00:00Z',
    horometer_at_maintenance: 250.0,
    performed_by: 'Ing. Roberto Silva - Taller Central',
    notes: 'Mantenimiento preventivo PM-250 horas. Cambio de filtros de aceite y fluido hidráulico.',
    maintenance_type: 'PREVENTIVO'
  });

  return {
    message: 'Base de datos inicializada exitosamente con datos de prueba y casos borde.',
    summary: {
      equipment: [
        { code: eq1.code, note: 'A punto de mantenimiento (246/250h)' },
        { code: eq2.code, note: 'Bloqueado (512h >= 500h)' },
        { code: eq3.code, note: 'Disponible (110h)' },
        { code: eq4.code, note: 'Disponible (180h)' },
        { code: eq5.code, note: 'En taller de mantenimiento' }
      ],
      operators: [
        { code: op1.code, note: 'Certificado vigente (Camión y Excavadora)' },
        { code: op2.code, note: 'Certificado vigente (Perforadora)' },
        { code: op3.code, note: 'CERTIFICACIÓN VENCIDA (Excavadora y Camión)' },
        { code: op4.code, note: 'Certificado vigente (Camión)' }
      ],
      critical_shift: {
        code: shiftToday.code,
        date: shiftToday.date,
        note: 'Cerrar este turno sumará 8 horas a CAM-001 (llegará a 254h) disparando su BLOQUEO inmediato.'
      }
    }
  };
}

// Script ejecutable standalone: tsx backend/src/seeds/seed.ts
if (process.argv[1]?.includes('seed.ts')) {
  (async () => {
    console.log('[Seed] Iniciando script de precarga de datos...');
    const repos = await getRepositories();
    if (process.env.SEED_CONFIRM !== 'RESET')
      throw new Error(
        'Este comando reemplaza datos de negocio. Define SEED_CONFIRM=RESET para ejecutarlo conscientemente.'
      );
    const result = await repos.transaction(() => seedDatabase(repos));
    console.log('[Seed] Resumen:', JSON.stringify(result, null, 2));
    process.exit(0);
  })().catch((err) => {
    console.error('[Seed] Error en script de datos de prueba:', err);
    process.exit(1);
  });
}
