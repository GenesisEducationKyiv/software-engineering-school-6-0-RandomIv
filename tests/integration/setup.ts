import { execSync } from 'node:child_process';
import { createClient, type RedisClientType } from 'redis';
import prisma from '../../src/core/db/db';

let redisClient: RedisClientType | null = null;

beforeAll(async () => {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  });

  if (process.env.REDIS_URL) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    await redisClient.connect();
  }
});

beforeEach(async () => {
  if (redisClient?.isOpen) {
    await redisClient.flushAll();
  }

  await prisma.$transaction([
    prisma.subscription.deleteMany(),
    prisma.repository.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();

  if (redisClient?.isOpen) {
    await redisClient.quit();
  }
});
