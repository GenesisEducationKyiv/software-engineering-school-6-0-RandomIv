import type { ConfirmationDto, ReleaseDto } from '../notification.schema';

export const NOTIFICATION_QUEUE = 'notifications';

export type NotificationMessage =
  | (ConfirmationDto & { type: 'confirmation' })
  | (ReleaseDto & { type: 'release' });
