import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(HttpStatus.NOT_FOUND, message);
  }
}
