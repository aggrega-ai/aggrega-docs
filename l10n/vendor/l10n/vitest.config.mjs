/**
 * vitest.config.mjs — The package's own test configuration, for `npm test` run
 * in the package's directory: every `*.test.mjs` under it, in Node, outside
 * installed dependencies.
 *
 * READS nothing and WRITES nothing. A repository that holds the package and runs
 * its tests from its own root reaches the same files through its own test
 * configuration; this one is what a checkout of the package alone runs.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.mjs'],
    exclude: ['**/node_modules/**'],
  },
});
