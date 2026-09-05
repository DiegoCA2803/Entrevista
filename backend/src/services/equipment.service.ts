import { Equipment, EquipmentStatus, EquipmentType } from '../domain/types.js';
import { IEquipmentRepository } from '../repositories/interfaces.js';

export class EquipmentService {
  constructor(private equipmentRepo: IEquipmentRepository) {}

  async getAllEquipment(): Promise<Equipment[]> {
    return this.equipmentRepo.findAll();
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    return this.equipmentRepo.findById(id);
  }

  async getEquipmentByCode(code: string): Promise<Equipment | null> {
    return this.equipmentRepo.findByCode(code);
  }

  async createEquipment(data: {
    code: string;
    name: string;
    type: EquipmentType;
    horometer?: number;
    maintenance_interval_hours?: number;
    last_maintenance_horometer?: number;
  }): Promise<Equipment> {
    const horometer = data.horometer ?? 0;
    const interval = data.maintenance_interval_hours ?? 250;
    const lastPm = data.last_maintenance_horometer ?? 0;
    
    // Regla 2: Si el horómetro ya alcanzó o superó el umbral, inicia BLOQUEADO
    const status: EquipmentStatus =
      horometer >= lastPm + interval ? 'BLOQUEADO' : 'DISPONIBLE';

    return this.equipmentRepo.create({
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      type: data.type,
      horometer,
      maintenance_interval_hours: interval,
      last_maintenance_horometer: lastPm,
      status
    });
  }

  /**
   * Verifica si el equipo alcanzó el umbral de mantenimiento.
   * Si lo alcanzó y no está en mantenimiento activo, lo cambia a BLOQUEADO.
   */
  async checkAndApplyMaintenanceBlock(equipmentId: string): Promise<Equipment> {
    const eq = await this.equipmentRepo.findById(equipmentId);
    if (!eq) throw new Error(`Equipo ${equipmentId} no encontrado.`);

    const nextThreshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
    if (eq.horometer >= nextThreshold && eq.status !== 'BLOQUEADO' && eq.status !== 'EN_MANTENIMIENTO') {
      return this.equipmentRepo.updateStatus(equipmentId, 'BLOQUEADO');
    }
    return eq;
  }

  /**
   * Suma horas de trabajo al horómetro y bloquea si cruza el umbral.
   */
  async addWorkedHours(equipmentId: string, hours: number): Promise<{ equipment: Equipment; newlyBlocked: boolean }> {
    const eq = await this.equipmentRepo.findById(equipmentId);
    if (!eq) throw new Error(`Equipo ${equipmentId} no encontrado.`);

    const newHorometer = Number((eq.horometer + hours).toFixed(2));
    const nextThreshold = eq.last_maintenance_horometer + eq.maintenance_interval_hours;
    
    let nextStatus = eq.status;
    let newlyBlocked = false;

    if (newHorometer >= nextThreshold) {
      if (eq.status !== 'BLOQUEADO') {
        nextStatus = 'BLOQUEADO';
        newlyBlocked = true;
      }
    }

    const updated = await this.equipmentRepo.updateHorometerAndStatus(equipmentId, newHorometer, nextStatus);
    return { equipment: updated, newlyBlocked };
  }
}
