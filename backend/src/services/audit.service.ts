import { AuditLog } from '../domain/types.js';
import { IAuditRepository } from '../repositories/interfaces.js';
import { requestContext } from '../core/request-context.js';

export class AuditService {
  constructor(private auditRepo: IAuditRepository) {}
  // Local audit belongs to the business transaction. External delivery uses the outbox.
  log(entry: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const context = requestContext.getStore();
    return this.auditRepo.log({
      ...entry,
      performed_by: context?.actor || entry.performed_by,
      details: { ...entry.details, ...(context ? { request_id: context.requestId } : {}) }
    });
  }
  getAllLogs(limit = 100): Promise<AuditLog[]> {
    return this.auditRepo.findAll(limit);
  }
}
