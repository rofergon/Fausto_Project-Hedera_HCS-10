// jest.setup.js
const path = require('path');
const fs = require('fs');

// Mock modules before tests run
jest.mock('path', () => {
  const originalModule = jest.requireActual('path');
  return {
    ...originalModule,
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/'))
  };
});

jest.mock('fs', () => {
  return {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    // Add other fs methods as needed
  };
});
