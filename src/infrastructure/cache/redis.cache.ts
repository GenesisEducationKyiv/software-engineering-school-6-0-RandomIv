import { createClient, type RedisClientType } from 'redis';
import { CachePort } from '../../application/ports/cache.port';
import { LoggerPort } from '../../application/ports/logger.port';

const REDIS_CONNECT_COOLDOWN_MS = 60_000;

export class RedisCache implements CachePort {
  private client: RedisClientType | null = null;
  private connectPromise: Promise<RedisClientType | null> | null = null;
  private disabledUntil = 0;

  constructor(
    private readonly url: string,
    private readonly logger: LoggerPort,
  ) {}

  private async getClient(): Promise<RedisClientType | null> {
    if (Date.now() < this.disabledUntil) return null;
    if (this.client?.isOpen) return this.client;
    if (this.connectPromise) return this.connectPromise;

    this.client = createClient({
      url: this.url,
      socket: { connectTimeout: 2000, reconnectStrategy: () => false },
    });
    this.client.on('error', (error: Error) => {
      this.logger.error({ err: error }, '[Redis] Client error');
    });

    this.connectPromise = this.client
      .connect()
      .then(() => this.client)
      .catch((error: unknown) => {
        this.logger.error({ err: error }, '[Redis] Failed to connect');
        this.disabledUntil = Date.now() + REDIS_CONNECT_COOLDOWN_MS;
        this.client = null;
        return null;
      })
      .finally(() => { this.connectPromise = null; });

    return this.connectPromise;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    if (!client) return null;
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();
    if (!client) return;
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  }
}
