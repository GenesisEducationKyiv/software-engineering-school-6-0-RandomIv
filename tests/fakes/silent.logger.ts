import { LoggerPort } from '../../src/application/ports/logger.port';

export class SilentLogger implements LoggerPort {
  info(): void {} warn(): void {} error(): void {}
}
