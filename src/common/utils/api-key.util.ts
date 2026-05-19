import { UnauthorizedError } from '../errors';

export const validateApiKey = (
  providedKey: string | undefined | null,
  expectedKey: string,
): void => {
  if (!providedKey || providedKey !== expectedKey) {
    throw new UnauthorizedError('Invalid API key');
  }
};
