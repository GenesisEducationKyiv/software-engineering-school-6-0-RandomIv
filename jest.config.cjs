/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/unit/**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],
  setupFiles: ['<rootDir>/tests/env.setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
  },
  clearMocks: true,
  restoreMocks: true,
};
