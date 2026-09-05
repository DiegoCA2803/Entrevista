import { HTTP_STATUS } from '../constants/index.js';

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  readonly isOperational: boolean = true;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = HTTP_STATUS.NOT_FOUND;

  constructor(entity: string, identifier: string | number) {
    super(`${entity} con identificador "${identifier}" no fue encontrado.`);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = HTTP_STATUS.CONFLICT;

  constructor(message: string) {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = HTTP_STATUS.BAD_REQUEST;

  constructor(message: string) {
    super(message);
  }
}

/**
 * Error especializado para la Regla 11:
 * Contiene y expone TODAS las violaciones de reglas de negocio acumuladas.
 */
export class BusinessRuleViolationError extends AppError {
  readonly statusCode = HTTP_STATUS.UNPROCESSABLE_ENTITY;
  readonly violations: string[];

  constructor(message: string, violations: string[]) {
    super(message);
    this.violations = violations;
  }
}
