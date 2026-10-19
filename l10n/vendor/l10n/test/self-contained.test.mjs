/**
 * self-contained.test.mjs — The package imports nothing outside its own
 * directory: every module specifier of every `.mjs` file under it is a Node
 * built-in, a package its `package.json` declares, or a relative path that
 * stays inside the package; and every `new URL(…, import.meta.url)` resolves
 * inside it too. That is what lets a copy of the directory, or a repository of
 * its own, install and test with nothing else beside it.
 *
 * READS every `.mjs` file under the package, outside installed dependencies,
 * and `package.json`. WRITES nothing.
 */

import './no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8'));
const DECLARED = new Set([...Object.keys(MANIFEST.dependencies || {}), ...Object.keys(MANIFEST.devDependencies || {})]);

/** Every `.mjs` file of the package, outside installed dependencies. */
function moduleFiles() {
  return fs
    .readdirSync(PACKAGE, { recursive: true })
    .filter((rel) => rel.endsWith('.mjs') && !rel.split(path.sep).includes('node_modules'))
    .map((rel) => path.join(PACKAGE, rel))
    .sort();
}

/** Whether a line is a comment line, where an `import(…)` is a type reference and not a load. */
const isCommentLine = (line) => /^\s*(?:\*|\/\/|\/\*)/.test(line);

/**
 * The module specifiers a file loads: its static imports and re-exports, its
 * side-effect imports and its dynamic imports outside comments; and the
 * relative paths it resolves with `new URL(…, import.meta.url)`.
 */
function specifiersOf(text) {
  const loads = [];
  for (const m of text.matchAll(/^(?:import|export)\s[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)) loads.push(m[1]);
  for (const m of text.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) loads.push(m[1]);
  const urls = [];
  for (const line of text.split('\n')) {
    if (isCommentLine(line)) continue;
    for (const m of line.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) loads.push(m[1]);
    for (const m of line.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) urls.push(m[1]);
  }
  return { loads, urls };
}

/** The package a bare specifier names: `@scope/name` or `name`. */
const packageOf = (specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

const inside = (file) => {
  const rel = path.relative(PACKAGE, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** What is wrong with one file's specifiers, one line per problem. */
function problemsOf(file) {
  const { loads, urls } = specifiersOf(fs.readFileSync(file, 'utf8'));
  const where = path.relative(PACKAGE, file);
  const problems = [];
  for (const spec of loads) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      if (!inside(path.resolve(path.dirname(file), spec))) problems.push(`${where}: imports ${spec}, outside the package`);
    } else if (spec.startsWith('node:') || builtinModules.includes(spec)) {
      continue;
    } else if (!DECLARED.has(packageOf(spec))) {
      problems.push(`${where}: imports ${spec}, which package.json does not declare`);
    }
  }
  for (const rel of urls) {
    if (!inside(path.resolve(path.dirname(file), rel)) && path.resolve(path.dirname(file), rel) !== PACKAGE.replace(/[\\/]$/, '')) {
      problems.push(`${where}: resolves ${rel}, outside the package`);
    }
  }
  return problems;
}

describe('the package stands alone', () => {
  it('no module under the package imports a path outside it or a package its manifest does not declare', () => {
    const files = moduleFiles();
    // The needles: this file is in the census, and the census reads its own imports.
    expect(files).toContain(fileURLToPath(import.meta.url));
    expect(specifiersOf(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')).loads.sort()).toEqual(
      ['./no-network.mjs', 'vitest', 'node:fs', 'node:module', 'node:path', 'node:url'].sort()
    );
    expect(files.flatMap(problemsOf)).toEqual([]);
  });

  it('declares the test runner it runs on, at the version its test script uses, and a test script', () => {
    expect(MANIFEST.scripts.test).toBe('vitest run');
    expect(DECLARED.has('vitest')).toBe(true);
    expect(fs.existsSync(path.join(PACKAGE, 'vitest.config.mjs'))).toBe(true);
  });

  it('a planted import outside the package, or of an undeclared package, is named', () => {
    const file = path.join(PACKAGE, 'src', 'planted.mjs');
    const read = (text) => {
      const { loads } = specifiersOf(text);
      return loads;
    };
    expect(read("import x from '../../../scripts/ci/workflow-rules.mjs';\nimport { parse } from 'yaml';\n")).toEqual([
      '../../../scripts/ci/workflow-rules.mjs',
      'yaml',
    ]);
    expect(inside(path.resolve(path.dirname(file), '../../../scripts/ci/workflow-rules.mjs'))).toBe(false);
    expect(DECLARED.has(packageOf('yaml'))).toBe(false);
  });
});
