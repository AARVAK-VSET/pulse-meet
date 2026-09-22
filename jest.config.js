module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/server/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/server/src/$1',
    '^@pulse-meet/shared$': '<rootDir>/shared/src/index.ts',
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/server/tsconfig.json',
    },
  },
};