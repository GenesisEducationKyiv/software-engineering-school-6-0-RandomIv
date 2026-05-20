import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}
