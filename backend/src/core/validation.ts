import { z } from 'zod';
import type { RequestHandler } from 'express';
export const equipmentTypes = z.enum([
  'CAMION_ACARREO',
  'EXCAVADORA',
  'PERFORADORA',
  'CARGADOR_FRONTAL',
  'TRACTOR_ORUGA'
]);
const text = z.string().trim().min(1).max(100);
const date = z.iso.date();
const hours = z.number().min(0.5).max(24).multipleOf(0.5);
const pair = z.object({ equipment_id: text, operator_id: text, is_override: z.literal(false).optional() });
export const schemas = {
  cancel: z.object({ reason: z.string().trim().min(3).max(2000) }),
  equipment: z.object({
    code: text,
    name: text,
    type: equipmentTypes,
    horometer: z.number().min(0).max(99999999).optional(),
    maintenance_interval_hours: z.number().positive().max(100000).optional(),
    last_maintenance_horometer: z.number().min(0).optional()
  }),
  operator: z.object({ code: text, name: text, document_id: text, is_active: z.boolean().optional() }),
  certification: z.object({
    equipment_type: equipmentTypes,
    issued_date: date,
    expiration_date: date,
    institution: text.optional()
  }),
  shift: z.object({
    date,
    period: z.enum(['DIA', 'NOCHE']),
    planned_duration_hours: hours,
    notes: z.string().trim().max(2000).optional(),
    assignments: z.array(pair).min(1, 'Agrega al menos una pareja de equipo y operador.').max(50)
  }),
  assignment: pair,
  close: z.object({
    actual_duration_hours: z.number().min(0).max(24),
    notes: z.string().trim().max(2000).optional()
  }),
  maintenance: z.object({
    equipment_id: text,
    notes: z.string().trim().min(3).max(2000),
    maintenance_type: z.enum(['PREVENTIVO', 'CORRECTIVO']).optional(),
    horometer_at_maintenance: z.number().min(0).max(99999999).optional()
  })
};
export function validate(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Revisa los datos del formulario.',
        violations: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
