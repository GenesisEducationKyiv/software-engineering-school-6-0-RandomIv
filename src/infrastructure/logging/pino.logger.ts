import pino, { type Logger as PinoInstance } from 'pino';
import { LoggerPort } from '../../application/ports/logger.port';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const createPinoInstance = (): PinoInstance =>
  pino({
    level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
    ...(!isProd && !isTest && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
    }),
  });

export class PinoLogger implements LoggerPort {
  private readonly instance: PinoInstance;

  constructor(instance: PinoInstance = createPinoInstance()) {
    this.instance = instance;
  }

  info(...args: unknown[]): void {
    this.instance.info(...(args as Parameters<PinoInstance['info']>));
  }
  warn(...args: unknown[]): void {
    this.instance.warn(...(args as Parameters<PinoInstance['warn']>));
  }
  error(...args: unknown[]): void {
    this.instance.error(...(args as Parameters<PinoInstance['error']>));
  }
}
