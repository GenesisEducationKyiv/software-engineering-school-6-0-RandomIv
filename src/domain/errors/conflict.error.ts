import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(HttpStatus.CONFLICT, message);
  }
}
