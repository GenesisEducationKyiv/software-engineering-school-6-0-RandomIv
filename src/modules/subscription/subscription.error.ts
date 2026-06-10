import { HttpStatus } from '../../common/constants/http-status.constant';
import { AppError } from '../../common/errors';

export class SubscriptionNotificationError extends AppError {
  constructor(message = 'Failed to send subscription confirmation email') {
    super(HttpStatus.INTERNAL_SERVER_ERROR, message);
  }
}
