import { AuditLog } from '../domain/types.js';
import { IAuditRepository } from '../repositories/interfaces.js';
import { ResilientExecutor } from '../resilience/resilient-executor.js';

export class AuditService {
  constructor(private auditRepo: IAuditRepository) {}

  async log(entry: {
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, any>;
    performed_by: string;
  }): Promise<AuditLog | null> {
    const { result } = await ResilientExecutor.executeWithFallback(
      'AuditService',
      async () => {
        return this.auditRepo.log(entry);
      },
      (error) => {
        console.warn(`[AuditService Fallback] No se pudo persistir log de auditoría en BD: ${error.message}`);
        return null;
      }
    );
    return result;
  }

  async getAllLogs(limit: number = 100): Promise<AuditLog[]> {
    const { result } = await ResilientExecutor.executeWithFallback(
      'AuditService',
      async () => {
        return this.auditRepo.findAll(limit);
      },
      () => {
        return [];
      }
    );
    return result;
  }
}
