module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/src/**/__tests__/**/*.test.ts', '**/src/**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
