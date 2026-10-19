/**
 * doctor.test.mjs — `l10n doctor` on both runnable examples, as shipped and with
 * each check broken in a scratch copy.
 *
 * READS the examples. WRITES only the temporary copies it makes of them; the
 * command itself writes nothing there, which a snapshot of each copy asserts.
 * No request leaves the process: the network guard is installed first, and a
 * fake SDK client class is handed to the command line to show none is built.
 */

import { networkAttempts } from './no-network.mjs';
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from '../src/cli.mjs';
import { DOCTOR_CHECKS } from '../src/doctor.mjs';
import { capture, copyExample, fakeAnthropic } from './helpers.mjs';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Where each example keeps what the checks read, relative to its copy's root. */
const EXAMPLE = {
  'json-site': {
    argv: [],
    config: 'l10n.config.json',
    prompt: 'i18n/prompts/de.md',
    general: 'i18n/prompts/_general.md',
    glossary: 'i18n/glossary.json',
    workflow: '.github/workflows/l10n.yml',
    collector: '.github/workflows/l10n-collect.yml',
  },
  'markdown-docs': {
    argv: ['--config', 'l10n/l10n.config.json'],
    config: 'l10n/l10n.config.json',
    prompt: 'l10n/prompts/ja.md',
    general: 'l10n/prompts/_general.md',
    glossary: 'l10n/glossary.json',
    workflow: '.github/workflows/l10n.yml',
    collector: '.github/workflows/l10n-collect.yml',
  },
};

/** Every file under `dir`, with its bytes, so a test can show a command wrote nothing. */
function snapshot(dir) {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true })
      .filter((rel) => fs.statSync(path.join(dir, rel)).isFile())
      .sort()
      .map((rel) => [rel, fs.readFileSync(path.join(dir, rel), 'utf8')])
  );
}

/** Runs `l10n doctor` in a copy of the example, after `breakIt` changed the copy; returns the code, the lines and the statuses by check. */
async function doctor(name, breakIt = () => {}) {
  const root = copyExample(name);
  dirs.push(root);
  const at = (rel) => path.join(root, rel);
  breakIt({ root, at, files: EXAMPLE[name] });
  const before = snapshot(root);
  const fake = fakeAnthropic();
  const io = capture();
  const code = await runCli(['doctor', ...EXAMPLE[name].argv], { cwd: root, env: {}, ClientClass: fake.FakeAnthropic, log: io.log, errlog: io.errlog });
  expect(snapshot(root)).toEqual(before);
  expect(fake.constructed).toEqual([]);
  const lines = io.out;
  const statuses = Object.fromEntries(
    DOCTOR_CHECKS.map((check) => {
      const line = lines.find((l) => l.includes(` ${check}: `));
      return [check, line ? line.trim().split(/\s{2,}/)[0] : 'missing'];
    })
  );
  return { code, lines, statuses, err: io.errors() };
}

/** The statuses of a run in which only `failed` failed and `unchecked` were not checked. */
const expected = (failed, unchecked = []) =>
  Object.fromEntries(DOCTOR_CHECKS.map((check) => [check, failed.includes(check) ? 'FAIL' : unchecked.includes(check) ? 'not checked' : 'pass']));

const editJson = (file, edit) => {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(value);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};
const editText = (file, from, to) => {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${file} does not hold ${JSON.stringify(from)}`);
  fs.writeFileSync(file, text.replace(from, to));
};

for (const name of Object.keys(EXAMPLE)) {
  describe(`l10n doctor on the ${name} example`, () => {
    it('passes every check, one line per check, and exits 0, with no network call, no client and no file written', async () => {
      const before = networkAttempts().length;
      const run = await doctor(name);
      expect(run.err).toBe('');
      expect(run.code).toBe(0);
      expect(run.statuses).toEqual(expected([]));
      expect(run.lines).toHaveLength(DOCTOR_CHECKS.length + 1);
      expect(run.lines[DOCTOR_CHECKS.length]).toBe(`doctor: all ${DOCTOR_CHECKS.length} checks passed.`);
      expect(networkAttempts().slice(before)).toEqual([]);
    });

    const VALIDATION = DOCTOR_CHECKS.filter((c) => !['configuration', 'API key variable'].includes(c));
    const rows = [
      {
        scenario: 'an unknown configuration key',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => (c.extra = true)),
        failed: ['configuration'],
        unchecked: VALIDATION,
        names: 'extra: unknown key',
      },
      {
        scenario: 'a target locale without its prompt file',
        breakIt: ({ at, files }) => fs.rmSync(at(files.prompt)),
        failed: ['prompt files'],
        names: `${path.basename(EXAMPLE[name].prompt)}: the per-language prompt file for`,
      },
      {
        scenario: 'an empty general prompt file',
        breakIt: ({ at, files }) => fs.writeFileSync(at(files.general), '\n'),
        failed: ['prompt files'],
        names: 'the general prompt file is empty',
      },
      {
        scenario: 'a glossary file that does not exist',
        breakIt: ({ at, files }) => fs.rmSync(at(files.glossary)),
        failed: ['glossary'],
        names: 'does not exist',
      },
      {
        scenario: 'no glossary in the configuration',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => delete c.glossary),
        failed: ['glossary'],
        names: 'the configuration names no glossary',
      },
      {
        scenario: 'a do_not_translate_case that is not a matching mode',
        breakIt: ({ at, files }) => editJson(at(files.glossary), (g) => (g.do_not_translate_case = 'Sensitive')),
        failed: ['glossary'],
        names: 'the glossary\'s "do_not_translate_case" is "Sensitive"',
      },
      {
        scenario: 'a do_not_translate entry object with an unknown case',
        breakIt: ({ at, files }) => editJson(at(files.glossary), (g) => (g.do_not_translate = [...(g.do_not_translate || []), { term: 'LASTRA', case: 'upper' }])),
        failed: ['glossary'],
        names: 'the glossary\'s "do_not_translate" entry',
      },
      {
        scenario: 'an API key variable beginning VITE_',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => (c.backend.apiKeyEnv = 'VITE_ANTHROPIC_API_KEY')),
        failed: ['configuration', 'API key variable'],
        unchecked: VALIDATION,
        names: '"VITE_ANTHROPIC_API_KEY" begins with VITE_',
      },
      {
        // The collector checks out the working branch the translation workflow names, so it cannot be checked either.
        scenario: 'no workflow file',
        breakIt: ({ at, files }) => fs.rmSync(at(files.workflow)),
        failed: ['workflow', 'collector'],
        names: '.github/workflows/l10n.yml does not exist',
      },
      {
        scenario: 'a pull-request trigger in the workflow',
        breakIt: ({ at, files }) => editText(at(files.workflow), '  workflow_dispatch:\n', '  workflow_dispatch:\n  pull_request:\n'),
        failed: ['workflow'],
        names: 'pull requests: on.pull_request must be absent',
      },
      {
        scenario: 'a further permission in the workflow',
        breakIt: ({ at, files }) => editText(at(files.workflow), '  actions: write\n', '  actions: write\n  pull-requests: write\n'),
        failed: ['workflow'],
        names: 'permissions: permissions must be',
      },
      {
        scenario: 'a concurrency group that cancels a run in progress',
        breakIt: ({ at, files }) => editText(at(files.workflow), 'cancel-in-progress: false', 'cancel-in-progress: true'),
        failed: ['workflow'],
        names: 'concurrency: concurrency.cancel-in-progress must be false',
      },
      {
        scenario: 'a schedule in the translation workflow',
        breakIt: ({ at, files }) => editText(at(files.workflow), '  workflow_dispatch:\n', "  workflow_dispatch:\n  schedule:\n    - cron: '*/30 * * * *'\n"),
        failed: ['workflow'],
        names: 'triggers: on must hold push and workflow_dispatch and nothing else',
      },
      {
        scenario: 'a workflow outside the subset doctor reads',
        breakIt: ({ at, files }) => editText(at(files.workflow), 'name: Translate', 'name: &name Translate'),
        failed: ['workflow', 'collector'],
        names: 'cannot be read here (line',
      },
      {
        scenario: 'no collector in the configuration',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => delete c.ci.collector),
        failed: ['collector'],
        names: 'the configuration names no ci.collector, so a batch is collected only by the next push or a manual run',
      },
      {
        scenario: 'no collector workflow file',
        breakIt: ({ at, files }) => fs.rmSync(at(files.collector)),
        failed: ['collector'],
        names: '.github/workflows/l10n-collect.yml does not exist',
      },
      {
        scenario: 'an hourly schedule in the collector',
        breakIt: ({ at, files }) => editText(at(files.collector), "cron: '*/10 * * * *'", "cron: '0 * * * *'"),
        failed: ['collector'],
        names: 'triggers: on.schedule must be [{"cron":"*/10 * * * *"}]',
      },
      {
        scenario: 'a push trigger in the collector',
        breakIt: ({ at, files }) => editText(at(files.collector), '  workflow_dispatch:\n', '  workflow_dispatch:\n  push:\n'),
        failed: ['collector'],
        names: 'triggers: on must hold schedule and workflow_dispatch and nothing else',
      },
      {
        scenario: 'a further permission in the collector',
        breakIt: ({ at, files }) => editText(at(files.collector), '  actions: write\n', '  actions: write\n  pull-requests: write\n'),
        failed: ['collector'],
        names: 'permissions: permissions must be',
      },
      {
        scenario: 'a pull-request trigger in the collector',
        breakIt: ({ at, files }) => editText(at(files.collector), '  workflow_dispatch:\n', '  workflow_dispatch:\n  pull_request_target:\n'),
        failed: ['collector'],
        names: 'pull requests: on.pull_request_target must be absent',
      },
      {
        scenario: 'a collector in a concurrency group of its own',
        breakIt: ({ at, files }) => editText(at(files.collector), 'group: l10n\n', 'group: l10n-collect\n'),
        failed: ['collector'],
        names: 'concurrency: the collector\'s concurrency.group must be the translation workflow\'s, "l10n"; it is "l10n-collect"',
      },
      {
        scenario: 'a collector whose API key reaches the install step',
        breakIt: ({ at, files }) => editText(at(files.collector), '\n\n      - name: Collect, submit and push the translation memory\n', '\n        env:\n          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n\n      - name: Collect, submit and push the translation memory\n'),
        failed: ['collector'],
        names: 'secrets: the step "Install" must not set ANTHROPIC_API_KEY',
      },
      {
        scenario: 'no CI section, and so no sync section',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => (delete c.ci, delete c.sync)),
        failed: ['workflow', 'collector', 'CI branch', 'derived commands and paths'],
        names: 'the configuration has no "ci" key naming ci.branch',
      },
      {
        scenario: 'no sync section',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => delete c.sync),
        failed: ['derived commands and paths'],
        names: 'the configuration names no sync.commands and no sync.paths',
      },
      {
        scenario: 'no derived command',
        breakIt: ({ at, files }) => editJson(at(files.config), (c) => (c.sync.commands = [])),
        failed: ['derived commands and paths'],
        names: 'the configuration names no sync.commands',
      },
    ];
    for (const row of rows) {
      it(`exits 1 naming ${row.failed.join(', ')} after ${row.scenario}`, async () => {
        const run = await doctor(name, row.breakIt);
        expect(run.code).toBe(1);
        expect(run.statuses).toEqual(expected(row.failed, row.unchecked));
        expect(run.lines.join('\n')).toContain(row.names);
        expect(run.lines[run.lines.length - 1]).toMatch(new RegExp(`^doctor: \\d+ of ${DOCTOR_CHECKS.length} checks did not pass: `));
      });
    }

    describe('with the workflows run by hand alone', () => {
      it('passes every check, reading the working branch from the translation workflow\'s checkout', async () => {
        const run = await doctor(name, ({ at, files }) => {
          byHandAlone(at(files.workflow));
          byHandAlone(at(files.collector));
        });
        expect(run.err).toBe('');
        expect(run.code).toBe(0);
        expect(run.statuses).toEqual(expected([]));
        expect(run.lines.join('\n')).toContain('l10n.yml: by hand alone, on main;');
        expect(run.lines.join('\n')).toContain('l10n-collect.yml: by hand alone;');
      });

      it('passes with the translation workflow alone run by hand, and the collector on its schedule', async () => {
        const run = await doctor(name, ({ at, files }) => byHandAlone(at(files.workflow)));
        expect(run.code).toBe(0);
        expect(run.statuses).toEqual(expected([]));
      });

      it('fails when the checkout names no branch, so no working branch can be read', async () => {
        const run = await doctor(name, ({ at, files }) => {
          byHandAlone(at(files.workflow));
          editText(at(files.workflow), 'ref: main', 'ref: ${{ github.ref_name }}');
        });
        expect(run.code).toBe(1);
        expect(run.statuses).toEqual(expected(['workflow', 'collector']));
        expect(run.lines.join('\n')).toContain("the checkout's with.ref must name the working branch, since the workflow runs by hand alone");
      });

      it('fails a manual dispatch that carries settings', async () => {
        const run = await doctor(name, ({ at, files }) => {
          byHandAlone(at(files.collector));
          editText(at(files.collector), '  workflow_dispatch:\n', '  workflow_dispatch:\n    inputs: {}\n');
        });
        expect(run.code).toBe(1);
        expect(run.statuses).toEqual(expected(['collector']));
        expect(run.lines.join('\n')).toContain('triggers: on.workflow_dispatch must be present with no settings');
      });
    });
  });
}

/** Rewrites a workflow's triggers to manual dispatch alone. */
function byHandAlone(file) {
  const text = fs.readFileSync(file, 'utf8');
  const next = text.replace(/^on:\n(?:[ #].*\n|\n)*?(?=permissions:)/m, 'on:\n  workflow_dispatch:\n\n');
  if (next === text) throw new Error(`${file}: no on: block before permissions:`);
  fs.writeFileSync(file, next);
}

describe('l10n doctor with the configuration below the repository root', () => {
  for (const check of ['workflow', 'collector']) {
    it(`requires the ${check}'s CI step to pass --config, naming the path`, async () => {
      const run = await doctor('markdown-docs', ({ at, files }) =>
        editText(at(files[check]), 'npx l10n ci --config l10n/l10n.config.json', 'npx l10n ci')
      );
      expect(run.code).toBe(1);
      expect(run.statuses).toEqual(expected([check]));
      expect(run.lines.join('\n')).toContain('the CI step must pass --config l10n/l10n.config.json');
    });
  }
});

describe('l10n doctor with a configuration of another name at the repository root', () => {
  /** A json-site copy whose CI-mode configuration is renamed `l10n.ci.json`, its workflows' CI steps edited by `edit`. */
  async function renamed(edit = (text) => text) {
    const root = copyExample('json-site');
    dirs.push(root);
    fs.renameSync(path.join(root, 'l10n.config.json'), path.join(root, 'l10n.ci.json'));
    for (const rel of [EXAMPLE['json-site'].workflow, EXAMPLE['json-site'].collector]) {
      const file = path.join(root, rel);
      fs.writeFileSync(file, edit(fs.readFileSync(file, 'utf8')));
    }
    const io = capture();
    const code = await runCli(['doctor', '--config', 'l10n.ci.json'], { cwd: root, env: {}, ClientClass: fakeAnthropic().FakeAnthropic, log: io.log, errlog: io.errlog });
    return { code, text: io.out.join('\n') };
  }

  it('requires the CI steps to pass --config, since l10n ci finds only l10n.config.json unaided', async () => {
    const run = await renamed();
    expect(run.code).toBe(1);
    expect(run.text).toContain('the CI step must pass --config l10n.ci.json, since the configuration is not l10n.config.json at the repository root');
  });

  it('passes the same rule once both CI steps name the configuration', async () => {
    const run = await renamed((text) => text.replace(/npx l10n ci(?! --config)/g, 'npx l10n ci --config l10n.ci.json'));
    expect(run.text).not.toContain('the CI step must pass --config');
  });
});
