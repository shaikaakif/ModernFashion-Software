export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function fail(message, code = 'VALIDATION_ERROR', details = null) {
  throw new AppError(message, code, details);
}

export function assert(condition, message, code = 'VALIDATION_ERROR', details = null) {
  if (!condition) fail(message, code, details);
}
