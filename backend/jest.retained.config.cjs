/** Retained first-release backend scope. Removed/deferred modules keep their original evidence. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex:
    '(modules/auth/auth\\.service|modules/family/family\\.service|modules/recipe/recipe\\.service|modules/recipe/recipe-favorite|modules/order/order\\.service|modules/order/order-status|modules/storage/storage\\.service|modules/user/user-bind|modules/user/user-delete|modules/timeline/timeline-summary)\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@prisma/client/runtime/(.*)$': '<rootDir>/../node_modules/@prisma/client/runtime/$1',
    '^@prisma/client$': '<rootDir>/../node_modules/@prisma/client',
  },
};
