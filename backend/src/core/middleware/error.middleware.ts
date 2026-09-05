import { Request, Response, NextFunction } from 'express';
import { AppError, BusinessRuleViolationError } from '../errors/app-error.js';
import { HTTP_STATUS } from '../constants/index.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
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
      detail: errMsg,
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
    fn(req, res, next).catch(next);
  };
}
