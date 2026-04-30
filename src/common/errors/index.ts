import { HttpStatus } from '../constants/http-status.constants';
import { AppError } from './app-error';

export { AppError };

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(HttpStatus.NOT_FOUND, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests from GitHub API') {
    super(HttpStatus.TOO_MANY_REQUESTS, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(HttpStatus.CONFLICT, message);
  }
}
