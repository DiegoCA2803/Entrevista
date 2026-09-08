import { Operator, Certification, EquipmentType } from '../domain/types.js';
import { IOperatorRepository } from '../repositories/interfaces.js';
import { NotFoundError, ValidationError } from '../core/errors/app-error.js';

export interface CertificationCheckResult {
  isValid: boolean;
  reason?: string;
  certification?: Certification;
}

export class OperatorService {
  constructor(private readonly operatorRepo: IOperatorRepository) {}

  async getAllOperators(): Promise<Operator[]> {
    return this.operatorRepo.findAll();
  }

  async getOperatorById(id: string): Promise<Operator | null> {
    return this.operatorRepo.findById(id);
  }

  async createOperator(data: {
    code: string;
    name: string;
    document_id: string;
    is_active?: boolean;
  }): Promise<Operator> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('El nombre del operador es obligatorio.');
    }
    if (!data.document_id || data.document_id.trim().length === 0) {
      throw new ValidationError('El documento de identidad es obligatorio.');
    }

    return this.operatorRepo.create({
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      document_id: data.document_id.trim(),
      is_active: data.is_active ?? true
    });
  }

  async addCertification(data: {
    operator_id: string;
    equipment_type: EquipmentType;
    issued_date: string;
    expiration_date: string;
    institution?: string;
  }): Promise<Certification> {
    if (data.expiration_date <= data.issued_date) {
      throw new ValidationError('La fecha de vencimiento debe ser posterior a la fecha de emisión.');
    }
    return this.operatorRepo.addCertification(data);
  }

  /**
   * Regla 4 y 9: Verifica si el operador tiene certificación vigente
   * para el tipo de equipo en la fecha del turno.
   */
  async validateCertificationForShift(
    operatorId: string,
    equipmentType: EquipmentType,
    shiftDate: string,
    lastDate: string = shiftDate
  ): Promise<CertificationCheckResult> {
    const operator = await this.operatorRepo.findById(operatorId);
    if (!operator) {
      return {
        isValid: false,
        reason: `El operador con ID ${operatorId} no existe en el sistema.`
      };
    }

    if (!operator.is_active) {
      return {
        isValid: false,
        reason: `El operador ${operator.name} (${operator.code}) está inactivo en el sistema.`
      };
    }

    const certs = await this.operatorRepo.getCertificationsByOperatorId(operatorId);
    const matchingCerts = certs.filter((c) => c.equipment_type === equipmentType);

    if (matchingCerts.length === 0) {
      return {
        isValid: false,
        reason: `El operador ${operator.name} no posee certificación para equipos de tipo "${equipmentType}".`
      };
    }

    // Buscar una certificación vigente para la fecha del turno (inclusive)
    const validCert = matchingCerts.find((c) => c.issued_date <= shiftDate && c.expiration_date >= lastDate);

    if (validCert) {
      return {
        isValid: true,
        certification: validCert
      };
    }

    // Si tiene certificaciones para ese tipo pero ninguna está vigente en la fecha del turno
    const latestCert = matchingCerts.sort((a, b) => b.expiration_date.localeCompare(a.expiration_date))[0];
    if (latestCert.expiration_date >= shiftDate && latestCert.expiration_date < lastDate)
      return {
        isValid: false,
        reason: `La certificación de ${operator.name} vence el ${latestCert.expiration_date} durante el turno. Debe cubrir toda la jornada hasta ${lastDate}.`
      };
    const isExpired = latestCert.expiration_date < shiftDate;

    if (isExpired) {
      return {
        isValid: false,
        reason: `La certificación de ${operator.name} para "${equipmentType}" venció el ${latestCert.expiration_date} (Turno programado para: ${shiftDate}).`
      };
    } else {
      return {
        isValid: false,
        reason: `La certificación de ${operator.name} para "${equipmentType}" aún no está vigente para la fecha ${shiftDate} (Emisión: ${latestCert.issued_date}).`
      };
    }
  }
}
