/**
 * doctor-local.test.mjs — `l10n doctor` under a local-mode configuration: the
 * json-site example's `l10n.local.json`, as shipped and with each check broken
 * in a scratch copy.
 *
 * READS the example. WRITES only the temporary copies it makes of it; the
 * command itself writes nothing there, which a snapshot of each copy asserts.
 * The network guard is installed first, and a fake SDK client class is handed
 * to the command line to show none is built.
 */

import { networkAttempts } from './no-network.mjs';
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from '../src/cli.mjs';
import { DOCTOR_CHECKS, LOCAL_DOCTOR_CHECKS } from '../src/doctor.mjs';
import { capture, copyExample, fakeAnthropic, writeJson } from './helpers.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Every file under `dir`, with its bytes and mode, so a test can show a command wrote nothing. */
function snapshot(dir) {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true })
      .filter((rel) => fs.statSync(path.join(dir, rel)).isFile())
      .sort()
      .map((rel) => [rel, `${fs.statSync(path.join(dir, rel)).mode}:${fs.readFileSync(path.join(dir, rel), 'utf8')}`])
  );
}

/** Runs `l10n doctor --config l10n.local.json` in a copy of the example after `breakIt`; returns the code, the lines and the status of each check. */
async function doctor(breakIt = () => {}, { argv = ['--config', 'l10n.local.json'] } = {}) {
  const root = copyExample('json-site');
  dirs.push(root);
  const at = (rel) => path.join(root, rel);
  breakIt({ root, at });
  const before = snapshot(root);
  const fake = fakeAnthropic();
  const io = capture();
  const attempts = networkAttempts().length;
  const code = await runCli(['doctor', ...argv], { cwd: root, env: {}, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog });
  expect(snapshot(root)).toEqual(before);
  expect(fake.constructed).toEqual([]);
  expect(networkAttempts().slice(attempts)).toEqual([]);
  const lines = io.out;
  // A line is `  <status>  <check>: <detail>`; the check is matched whole, since "workflow" ends "check workflow".
  const lineOf = (check) => lines.find((l) => (l.trim().split(/\s{2,}/)[1] || '').startsWith(`${check}: `));
  const statuses = Object.fromEntries(
    [...new Set([...LOCAL_DOCTOR_CHECKS, ...DOCTOR_CHECKS])].map((check) => {
      const line = lineOf(check);
      return [check, line ? line.trim().split(/\s{2,}/)[0] : 'missing'];
    })
  );
  const line = (check) => lineOf(check) || '';
  return { code, lines, statuses, line };
}

/** The statuses of a run in which only `failed` failed and `unchecked` were not checked; the CI-mode checks never run. */
function expected(failed = [], unchecked = []) {
  const out = {};
  for (const check of LOCAL_DOCTOR_CHECKS) out[check] = failed.includes(check) ? 'FAIL' : unchecked.includes(check) ? 'not checked' : 'pass';
  for (const check of DOCTOR_CHECKS) if (!LOCAL_DOCTOR_CHECKS.includes(check)) out[check] = 'missing';
  return out;
}

const editJson = (file, edit) => {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  writeJson(file, value);
};

describe('l10n doctor in the local mode', () => {
  it('passes every check on the example as shipped, and runs none of the CI-mode checks', async () => {
    const run = await doctor();
    expect(run.code).toBe(0);
    expect(run.statuses).toEqual(expected());
    expect(run.lines.at(-1)).toBe('doctor: all 8 checks passed.');
  });

  const BROKEN = [
    { name: 'a configuration that does not validate', failed: ['configuration'], unchecked: ['prompt files', 'glossary', 'local commands and paths', 'pre-push hook', 'prepare script', 'check workflow'], edit: ({ at }) => editJson(at('l10n.local.json'), (c) => (c.ci = { branch: 'l10n-memory' })) },
    { name: 'a missing prompt file', failed: ['prompt files'], edit: ({ at }) => fs.rmSync(at('i18n/prompts/de.md')) },
    { name: 'a missing glossary', failed: ['glossary'], edit: ({ at }) => fs.rmSync(at('i18n/glossary.json')) },
    { name: 'an API key variable beginning VITE_', failed: ['configuration', 'API key variable'], unchecked: ['prompt files', 'glossary', 'local commands and paths', 'pre-push hook', 'prepare script', 'check workflow'], edit: ({ at }) => editJson(at('l10n.local.json'), (c) => (c.backend.apiKeyEnv = 'VITE_ANTHROPIC_API_KEY')) },
    { name: 'no local.commands', failed: ['local commands and paths'], detail: 'names no local.commands', edit: ({ at }) => editJson(at('l10n.local.json'), (c) => (c.local.commands = [])) },
    { name: 'no local.paths', failed: ['local commands and paths'], detail: 'names no local.paths', edit: ({ at }) => editJson(at('l10n.local.json'), (c) => delete c.local.paths) },
    { name: 'no pre-push hook', failed: ['pre-push hook'], detail: '.githooks/pre-push does not exist', edit: ({ at }) => fs.rmSync(at('.githooks/pre-push')) },
    { name: 'a hook that is not executable', failed: ['pre-push hook'], detail: 'it is not executable', edit: ({ at }) => fs.chmodSync(at('.githooks/pre-push'), 0o644) },
    { name: 'a hook that does not run l10n prepush', failed: ['pre-push hook'], detail: 'it does not run `l10n prepush`', edit: ({ at }) => fs.writeFileSync(at('.githooks/pre-push'), '#!/bin/sh\nexec npm test "$@"\n') },
    { name: 'a hook that drops git’s arguments', failed: ['pre-push hook'], detail: 'it does not pass git\'s arguments', edit: ({ at }) => fs.writeFileSync(at('.githooks/pre-push'), '#!/bin/sh\nexec npx --no l10n prepush --config l10n.local.json\n') },
    { name: 'a hook that does not name the configuration', failed: ['pre-push hook'], detail: 'it must pass --config l10n.local.json', edit: ({ at }) => fs.writeFileSync(at('.githooks/pre-push'), '#!/bin/sh\nexec npx --no l10n prepush "$@"\n') },
    { name: 'no package.json', failed: ['prepare script'], detail: 'package.json does not exist', edit: ({ at }) => fs.rmSync(at('package.json')) },
    { name: 'no prepare script', failed: ['prepare script'], detail: 'has no "prepare" script', edit: ({ at }) => editJson(at('package.json'), (m) => delete m.scripts.prepare) },
    { name: 'a prepare script pointing elsewhere', failed: ['prepare script'], detail: 'does not set core.hooksPath to .githooks', edit: ({ at }) => editJson(at('package.json'), (m) => (m.scripts.prepare = 'git config core.hooksPath hooks')) },
    { name: 'no check workflow', failed: ['check workflow'], detail: '.github/workflows/l10n-check.yml does not exist', edit: ({ at }) => fs.rmSync(at('.github/workflows/l10n-check.yml')) },
    {
      name: 'a check workflow with pull_request_target',
      failed: ['check workflow'],
      detail: 'pull requests: on.pull_request_target must be absent',
      edit: ({ at }) => {
        const file = at('.github/workflows/l10n-check.yml');
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('  workflow_dispatch:\n', '  workflow_dispatch:\n  pull_request_target:\n'));
      },
    },
    {
      name: 'a check workflow handing the check step a secret',
      failed: ['check workflow'],
      detail: 'must not read a secret or github.token',
      edit: ({ at }) => {
        const file = at('.github/workflows/l10n-check.yml');
        fs.writeFileSync(file, `${fs.readFileSync(file, 'utf8')}        env:\n          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}\n`);
      },
    },
    {
      name: 'a check workflow that may write',
      failed: ['check workflow'],
      detail: 'permissions must be {"contents":"read"}',
      edit: ({ at }) => {
        const file = at('.github/workflows/l10n-check.yml');
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('  contents: read\n', '  contents: write\n'));
      },
    },
  ];

  for (const row of BROKEN) {
    it(`fails one check on ${row.name}`, async () => {
      const run = await doctor(row.edit);
      expect(run.code).toBe(1);
      expect(run.statuses).toEqual(expected(row.failed, row.unchecked || []));
      if (row.detail) expect(run.line(row.failed[0])).toContain(row.detail);
    });
  }

  it('reads the mode from the file as written when the configuration does not validate', async () => {
    const run = await doctor(({ at }) => editJson(at('l10n.local.json'), (c) => (c.local.unknown = true)));
    expect(run.statuses['pre-push hook']).toBe('not checked');
    expect(run.statuses.workflow).toBe('missing');
  });
});
