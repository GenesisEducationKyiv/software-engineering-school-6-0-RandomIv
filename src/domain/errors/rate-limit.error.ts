import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from './app.error';

export class RateLimitError extends AppError {
  constructor(message = 'Too Many Requests from GitHub API') {
    super(HttpStatus.TOO_MANY_REQUESTS, message);
  }
}
