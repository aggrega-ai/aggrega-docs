#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Cognitio s.r.l.
//
// optimise-screenshots.mjs — rewrite every PNG under one directory into another,
// smaller, and list each with its dimensions and its size before and after.
//
//   node scripts/optimise-screenshots.mjs <from-dir> <to-dir>
//
// It reads the PNGs capture-editor-screenshots.sh takes of the editor and writes
// what the documentation keeps under images/editor/. Each stays a PNG of the same
// dimensions, written with a palette of at most 256 colours chosen for that image,
// error-diffusion dithering and the strongest zlib compression. An editor's window
// is drawn in a few flat colours and the antialiased edges of its text, which a
// palette of that size carries with no difference a reader can see, in a fraction
// of the bytes; rewriting the capture without a palette saves almost nothing,
// because the capture is already compressed. The palette is chosen by a
// fixed procedure and no metadata is written, so the same capture gives the same
// bytes on every run.
//
// It uses the sharp the documentation site already installs (site/node_modules),
// so it needs `npm ci` in site/ first and installs nothing of its own. The
// destination must not exist yet; the layout below the source is kept.
//
// Exit status: 0 when every PNG was written, 1 when one could not be, 2 on a
// usage error.

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, '..', 'site');

function refuseArguments(message) {
  process.stderr.write(`optimise-screenshots: ${message}\nusage: node scripts/optimise-screenshots.mjs <from-dir> <to-dir>\n`);
  process.exit(2);
}

const [from, to] = process.argv.slice(2);
if (from === '--help' || from === '-h') {
  process.stdout.write('usage: node scripts/optimise-screenshots.mjs <from-dir> <to-dir>\n');
  process.exit(0);
}
if (!from || !to || process.argv.length !== 4) { refuseArguments('give the directory to read and the directory to write'); }
if (!existsSync(from) || !statSync(from).isDirectory()) { refuseArguments(`${from} is not a directory`); }
if (existsSync(to)) { refuseArguments(`${to} already exists; name a directory that does not`); }

let sharp;
try {
  sharp = createRequire(join(site, 'package.json'))('sharp');
} catch (err) {
  refuseArguments(`sharp is not installed in ${site}: run \`npm ci\` there first (${err.message})`);
}
// One thread, so the encoder's choices do not depend on how many cores it ran on.
sharp.concurrency(1);

function pngsUnder(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { out.push(...pngsUnder(p)); } else if (e.isFile() && e.name.endsWith('.png')) { out.push(p); }
  }
  return out;
}

const files = pngsUnder(from);
let failed = 0;
let before = 0;
let after = 0;
for (const file of files) {
  const rel = relative(from, file);
  const dest = join(to, rel);
  mkdirSync(dirname(dest), { recursive: true });
  try {
    const info = await sharp(file)
      .png({ palette: true, colours: 256, quality: 100, dither: 1.0, effort: 10, compressionLevel: 9 })
      .toFile(dest);
    const was = statSync(file).size;
    before += was;
    after += info.size;
    process.stdout.write(`${rel}\t${info.width}x${info.height}\t${was} -> ${info.size} bytes\n`);
  } catch (err) {
    failed++;
    process.stdout.write(`${rel}\tNOT WRITTEN: ${err.message}\n`);
  }
}
process.stdout.write(`${files.length - failed} of ${files.length} PNG(s) written to ${to}: ${before} -> ${after} bytes\n`);
process.exit(failed === 0 ? 0 : 1);
