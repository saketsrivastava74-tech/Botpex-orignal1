import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'kernel/tests/**/*.test.ts',
      'testing/tests/**/*.test.ts',
      'adapters/tests/**/*.test.ts',
      'extensions/tests/**/*.test.ts',
      'package-specification/tests/**/*.test.ts',
      'compatibility/tests/**/*.test.ts',
      'runtimes/*/tests/**/*.test.ts',
      'tests/**/*.test.ts'
    ],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default']
  }
});
