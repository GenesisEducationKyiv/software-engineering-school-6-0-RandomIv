import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../../config';
import { PrismaClient } from '../../generated/prisma/client';

// Reused across Jest module-registry resets (jest.resetModules()) to avoid
// spinning up a second PrismaClient/query-engine instance in the same
// process, which crashes the WASM query compiler.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: config.DATABASE_URL })),
  });

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
