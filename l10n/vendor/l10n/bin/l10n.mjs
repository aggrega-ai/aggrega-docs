#!/usr/bin/env node
/**
 * l10n — the command-line entry point of `@aggrega-ai/l10n`.
 *
 * READS and WRITES only what the command it runs does (see `src/cli.mjs`); this
 * file maps the command's result onto the process exit status.
 */

import { runCli } from '../src/cli.mjs';

runCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error('Fatal error:', (err && err.message) || err);
    process.exit(1);
  }
);
