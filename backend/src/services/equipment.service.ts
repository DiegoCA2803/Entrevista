import { Equipment, EquipmentStatus, EquipmentType } from '../domain/types.js';
import { IEquipmentRepository } from '../repositories/interfaces.js';
import { NotFoundError } from '../core/errors/app-error.js';
import { BUSINESS_RULES_CONFIG } from '../core/constants/index.js';

export class EquipmentService {
  constructor(private readonly equipmentRepo: IEquipmentRepository) {}

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
    const interval = data.maintenance_interval_hours ?? BUSINESS_RULES_CONFIG.DEFAULT_MAINTENANCE_INTERVAL_HOURS;
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
    const equipment = await this.equipmentRepo.findById(equipmentId);
    if (!equipment) {
      throw new NotFoundError('Equipo minero', equipmentId);
    }

    const nextThreshold = equipment.last_maintenance_horometer + equipment.maintenance_interval_hours;
    if (equipment.horometer >= nextThreshold && equipment.status !== 'BLOQUEADO' && equipment.status !== 'EN_MANTENIMIENTO') {
      return this.equipmentRepo.updateStatus(equipmentId, 'BLOQUEADO');
    }
    return equipment;
  }

  /**
   * Suma horas de trabajo al horómetro y bloquea si cruza el umbral.
   */
  async addWorkedHours(equipmentId: string, hours: number): Promise<{ equipment: Equipment; newlyBlocked: boolean }> {
    const equipment = await this.equipmentRepo.findById(equipmentId);
    if (!equipment) {
      throw new NotFoundError('Equipo minero', equipmentId);
    }

    const newHorometer = Number((equipment.horometer + hours).toFixed(2));
    const nextThreshold = equipment.last_maintenance_horometer + equipment.maintenance_interval_hours;
    
    let nextStatus = equipment.status;
    let newlyBlocked = false;

    if (newHorometer >= nextThreshold) {
      if (equipment.status !== 'BLOQUEADO') {
        nextStatus = 'BLOQUEADO';
        newlyBlocked = true;
      }
    }

    const updated = await this.equipmentRepo.updateHorometerAndStatus(equipmentId, newHorometer, nextStatus);
    return { equipment: updated, newlyBlocked };
  }
}
