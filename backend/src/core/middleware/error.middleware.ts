import { Request, Response, NextFunction } from 'express';
import { AppError, BusinessRuleViolationError } from '../errors/app-error.js';
import { HTTP_STATUS } from '../constants/index.js';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  const code = (err as Error & { code?: string }).code;
  if (code === '23505') {
    res.status(409).json({
      error: 'Ya existe un registro con ese código, fecha/jornada o recurso asignado.',
      request_id: res.locals.requestId
    });
    return;
  }
  if (['23503', '23514', '22P02', '22007', '22008', '22003'].includes(code || '')) {
    res
      .status(400)
      .json({ error: 'Los datos no cumplen las restricciones de integridad de la base de datos.' });
    return;
  }
  if (
    ['ECONNREFUSED', 'ECONNRESET', '57P01', '57P03', '53300', '55P03'].includes(code || '') ||
    err.message?.includes('timeout') ||
    err.message?.includes('Connection terminated')
  ) {
    res.status(503).json({
      error: 'La base de datos no está disponible temporalmente. Reintenta con la misma Idempotency-Key.',
      request_id: res.locals.requestId
    });
    return;
  }
  if ((err as any).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El JSON de la solicitud no es válido.' });
    return;
  }
  // Manejo de errores controlados del dominio (Clean Architecture)
  if (err instanceof BusinessRuleViolationError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      violations: err.violations,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Errores de concurrencia o unicidad de base de datos no capturados
  const errMsg = err.message || '';
  if (
    errMsg.includes('unicidad') ||
    errMsg.includes('duplicate') ||
    errMsg.includes('uq_') ||
    errMsg.includes('violates unique constraint')
  ) {
    res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      error: 'Conflicto de concurrencia: El recurso ya fue asignado en este turno.',
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Errores no controlados (500 Internal Server Error)
  console.error('[Unhandled Exception]:', err);
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: 'Error interno del servidor en la operación minera.',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    timestamp: new Date().toISOString()
  });
}

/**
 * Higher-Order Function para envolver controladores asíncronos y canalizar
 * excepciones automáticamente al middleware de error sin try/catch redundantes.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    return fn(req, res, next).catch(next);
  };
}
