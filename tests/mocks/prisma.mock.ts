import type { PrismaClient } from '../../src/generated/prisma/client';
import { mockDeep, mockReset } from 'jest-mock-extended';

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('../../src/core/db/db', () => ({
  __esModule: true,
  default: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});
