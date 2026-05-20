import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}
