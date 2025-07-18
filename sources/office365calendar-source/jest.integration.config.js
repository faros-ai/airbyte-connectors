module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 60000,
  testMatch: ['**/integration-tests/**/*.test.ts'],
  transform: {
    '\\.ts?$': [
      'ts-jest',
      {
        tsconfig: 'test/tsconfig.json'
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};