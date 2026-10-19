#!/usr/bin/env node
/**
 * config-reference.mjs — The package script that writes the configuration
 * reference into the package README (`npm run reference`).
 *
 * READS `README.md` beside `package.json`, and the schema through
 * `src/config-reference.mjs`. WRITES `README.md`: the body of its
 * `config-reference` generated section, and nothing outside it. With `--check`
 * it WRITES nothing and exits 1 when the committed section differs from a fresh
 * generation.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readReference, renderConfigReference, spliceReference } from '../src/config-reference.mjs';

const README = fileURLToPath(new URL('../README.md', import.meta.url));

const text = fs.readFileSync(README, 'utf8');
const fresh = renderConfigReference();

if (process.argv.includes('--check')) {
  if (readReference(text) === fresh) {
    console.log('reference: README.md holds the configuration reference the schema generates.');
    process.exit(0);
  }
  console.error('reference: README.md differs from the configuration reference the schema generates; run `npm run reference`.');
  process.exit(1);
}

const next = spliceReference(text, fresh);
if (next !== text) fs.writeFileSync(README, next, 'utf8');
console.log(next === text ? 'reference: README.md already up to date.' : 'reference: README.md rewritten.');
