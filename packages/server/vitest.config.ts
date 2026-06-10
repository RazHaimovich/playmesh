import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 10_000
  },
  resolve: {
    alias: {
      // Run e2e tests against the client SDK source without a build step.
      '@playmesh/client': resolve(import.meta.dirname, '../client/src/index.ts')
    }
  }
});
