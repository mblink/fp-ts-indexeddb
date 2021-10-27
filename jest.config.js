module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testRunner: "jest-jasmine2",
  setupFiles: [
    "fake-indexeddb/auto"
  ],
};