export default {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: false,
            decorators: true,
            dynamicImport: true,
          },
          target: 'es2021',
        },
        module: {
          type: 'es6',
          noInterop: false,
        },
      },
    ],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(@langchain/core|langchain)/.*)',
  ],
  detectOpenHandles: true,
  forceExit: true,
}; 