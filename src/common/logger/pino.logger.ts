import pino, { type Logger as PinoInstance } from 'pino';
import type { Logger } from './logger.interface';

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

const createPinoInstance = (): PinoInstance =>
  pino({
    level: isTest ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
    ...(!isProd &&
      !isTest && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
  });

export class PinoLogger implements Logger {
  private readonly instance: PinoInstance;

  public constructor(instance: PinoInstance = createPinoInstance()) {
    this.instance = instance;
  }

  public info(...args: unknown[]): void {
    this.instance.info(...(args as Parameters<PinoInstance['info']>));
  }

  public warn(...args: unknown[]): void {
    this.instance.warn(...(args as Parameters<PinoInstance['warn']>));
  }

  public error(...args: unknown[]): void {
    this.instance.error(...(args as Parameters<PinoInstance['error']>));
  }
}

export const pinoLogger: Logger = new PinoLogger();
