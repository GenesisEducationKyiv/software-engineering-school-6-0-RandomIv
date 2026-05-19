import { createClient, type RedisClientType } from 'redis';
import { config } from '../../config';
import { logger } from '../logger';

let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<RedisClientType | null> | null = null;
let redisDisabledUntil = 0;
const REDIS_CONNECT_COOLDOWN_MS = 60_000;

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  if (!config.REDIS_URL) {
    return null;
  }

  if (Date.now() < redisDisabledUntil) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisConnectPromise) {
    return redisConnectPromise;
  }

  redisClient = createClient({
    url: config.REDIS_URL,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: () => false,
    },
  });
  redisClient.on('error', (error: Error) => {
    logger.error({ err: error }, '[Redis] Client error');
  });

  redisConnectPromise = redisClient
    .connect()
    .then(() => redisClient)
    .catch((error: unknown) => {
      logger.error({ err: error }, '[Redis] Failed to connect');
      redisDisabledUntil = Date.now() + REDIS_CONNECT_COOLDOWN_MS;
      redisClient = null;
      return null;
    })
    .finally(() => {
      redisConnectPromise = null;
    });

  return redisConnectPromise;
};
