/**
 * Jest configuration for the PulseMeet backend.
 *
 * Two projects share the same TypeScript transform and path aliases:
 *  - unit:        fast, fully mocked tests of individual services/utilities (test/**\/*.spec.ts)
 *  - integration: boots real Nest modules and exercises HTTP routes with supertest,
 *                 backed by an in-memory Google API fake and in-memory cache (test/**\/*.int-spec.ts)
 *
 * Both projects load test/setup/test-env.ts (forces a test-only environment) and
 * test/setup/no-network.ts (fails any outbound network call), so no test can ever
 * reach production Google Workspace data.
 */
const sharedConfig = {
  rootDir: __dirname,
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    // tsconfig.spec.json enables isolatedModules, so ts-jest transpiles without type-checking
    // (googleapis typings are huge). Types are checked separately by `npm run test:typecheck`.
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    // resolve the shared workspace from source so tests don't depend on a prior `npm run build:shared`
    '^@pulse-meet/shared$': '<rootDir>/../shared/index.ts',
  },
  setupFiles: ['<rootDir>/test/setup/test-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup/no-network.ts'],
  clearMocks: true,
  restoreMocks: true,
};

module.exports = {
  projects: [
    {
      ...sharedConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/test/**/*.spec.ts'],
    },
    {
      ...sharedConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts', '!src/**/interfaces/**', '!src/**/dto/**'],
  coverageDirectory: '<rootDir>/coverage',
};
