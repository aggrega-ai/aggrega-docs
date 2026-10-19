import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { WorkflowReadError, checkoutRef, collectorProblems, manualOnly, readWorkflow, sharedGroupProblems, workflowProblems } from './workflow.mjs';
import { EXAMPLES } from '../test/helpers.mjs';

/** The json-site example's workflow template, which holds every rule. */
const TEMPLATE = path.join(EXAMPLES, 'json-site', '.github', 'workflows', 'l10n.yml');
const TEXT = fs.readFileSync(TEMPLATE, 'utf8');
/** Its collector, which holds the collector's rules. */
const COLLECTOR_TEXT = fs.readFileSync(path.join(EXAMPLES, 'json-site', '.github', 'workflows', 'l10n-collect.yml'), 'utf8');
const CONTEXT = {
  working: 'main',
  paths: ['content/en/**', 'ui/en.json', 'i18n/messages/**', 'i18n/prompts/**'],
  apiKeyEnv: 'ANTHROPIC_API_KEY',
};

/** The rules that report a problem, by name. */
const failing = (wf, text = TEXT, context = CONTEXT) =>
  workflowProblems(wf, { ...context, text })
    .filter((r) => r.problems.length > 0)
    .map((r) => r.rule);

describe('readWorkflow — the subset it reads', () => {
  const rows = [
    {
      scenario: 'mappings, comments and the core schema',
      text: '# a workflow\nname: Translate\non:\n  workflow_dispatch:\nn: ~\nt: true\ni: 20\nf: 1.5\nv: 4.2.2\n',
      value: { name: 'Translate', on: { workflow_dispatch: null }, n: null, t: true, i: 20, f: 1.5, v: '4.2.2' },
    },
    {
      scenario: 'a sequence of mappings, and a sequence at its key’s indentation',
      text: 'steps:\n  - uses: a/b@c # v1\n    with:\n      ref: main\n  - run: x\nlist:\n- one\n- two\n',
      value: { steps: [{ uses: 'a/b@c', with: { ref: 'main' } }, { run: 'x' }], list: ['one', 'two'] },
    },
    {
      scenario: 'flow sequences and an empty flow mapping',
      text: "branches: [main, 'x, y']\nnone: []\npermissions: {}\n",
      value: { branches: ['main', 'x, y'], none: [], permissions: {} },
    },
    {
      scenario: 'quoted scalars and their escapes',
      text: "a: 'it''s # not a comment'\nb: \"a\\tb\\\"\"\n",
      value: { a: "it's # not a comment", b: 'a\tb"' },
    },
    {
      scenario: 'literal block scalars, clipped and stripped',
      text: 'run: |\n  one\n\n  two # kept\nlast: |-\n  x\n',
      value: { run: 'one\n\ntwo # kept\n', last: 'x' },
    },
  ];
  for (const row of rows) {
    it(`reads ${row.scenario}`, () => {
      expect(readWorkflow(row.text)).toEqual(row.value);
    });
  }

  it('reads the workflow template the json-site example ships', () => {
    const wf = readWorkflow(TEXT);
    expect(Object.keys(wf.on)).toEqual(['push', 'workflow_dispatch']);
    expect(wf.jobs.translate.steps.map((s) => s.name || s.uses.split('@')[0])).toEqual([
      'actions/checkout',
      'actions/setup-node',
      'Install',
      'Collect, submit and push the translation memory',
    ]);
  });
});

describe('readWorkflow — what it refuses, naming the line (one fault per row)', () => {
  const rows = [
    { scenario: 'an anchor', text: 'a: 1\nb: &x 2\n', line: 2 },
    { scenario: 'an alias', text: 'a:\n  - *x\n', line: 2 },
    { scenario: 'a tag', text: 'a: !!str 1\n', line: 1 },
    { scenario: 'a folded block scalar', text: 'a: >-\n  b\n', line: 1 },
    { scenario: 'a flow mapping that is not empty', text: 'a: { b: 1 }\n', line: 1 },
    { scenario: 'a plain scalar continued on the next line', text: 'a: one\n  two\n', line: 2 },
    { scenario: 'a quoted scalar continued on the next line', text: "a: 'one\n  two'\n", line: 1 },
    { scenario: 'a repeated key', text: 'a: 1\nb: 2\na: 3\n', line: 3 },
    { scenario: 'a second document', text: 'a: 1\n---\nb: 2\n', line: 2 },
    { scenario: 'a tab in an indentation', text: 'a:\n\tb: 1\n', line: 2 },
    { scenario: 'a hexadecimal integer', text: 'a: 0x1F\n', line: 1 },
    { scenario: 'a quoted key', text: '"a": 1\n', line: 1 },
  ];
  for (const row of rows) {
    it(`refuses ${row.scenario}`, () => {
      let thrown;
      try {
        readWorkflow(row.text);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(WorkflowReadError);
      expect(thrown.line).toBe(row.line);
      expect(thrown.message).toMatch(new RegExp(`^line ${row.line}: `));
    });
  }

  it('refuses a file that is not a mapping', () => {
    expect(() => readWorkflow('- a\n- b\n')).toThrow(WorkflowReadError);
    expect(() => readWorkflow('')).toThrow(WorkflowReadError);
  });
});

describe('the translation workflow rules (one fault per row)', () => {
  it('the template holds every rule', () => {
    expect(failing(readWorkflow(TEXT))).toEqual([]);
  });

  const clone = () => readWorkflow(TEXT);
  const rows = [
    { scenario: 'a pull-request trigger', mutate: (wf) => (wf.on.pull_request = null), fails: ['triggers', 'pull requests'] },
    { scenario: 'a pull_request_target trigger', mutate: (wf) => (wf.on.pull_request_target = { types: ['opened'] }), fails: ['triggers', 'pull requests'] },
    { scenario: 'a schedule', mutate: (wf) => (wf.on.schedule = [{ cron: '*/30 * * * *' }]), fails: ['triggers'] },
    { scenario: 'a push on another branch', mutate: (wf) => (wf.on.push.branches = ['develop']), fails: ['triggers'] },
    { scenario: 'a trigger path missing', mutate: (wf) => wf.on.push.paths.pop(), fails: ['triggers'] },
    { scenario: 'no manual dispatch', mutate: (wf) => delete wf.on.workflow_dispatch, fails: ['triggers'] },
    { scenario: 'a further permission', mutate: (wf) => (wf.permissions['pull-requests'] = 'write'), fails: ['permissions'] },
    { scenario: 'permissions of the job’s own', mutate: (wf) => (wf.jobs.translate.permissions = { contents: 'write' }), fails: ['permissions'] },
    { scenario: 'a second job', mutate: (wf) => (wf.jobs.other = { 'runs-on': 'ubuntu-latest', steps: [] }), fails: ['permissions'] },
    { scenario: 'a run in progress cancelled', mutate: (wf) => (wf.concurrency['cancel-in-progress'] = true), fails: ['concurrency'] },
    { scenario: 'no concurrency group', mutate: (wf) => delete wf.concurrency.group, fails: ['concurrency'] },
    { scenario: 'a checkout that persists its credential', mutate: (wf) => (wf.jobs.translate.steps[0].with['persist-credentials'] = true), fails: ['checkout'] },
    { scenario: 'a checkout of another branch', mutate: (wf) => (wf.jobs.translate.steps[0].with.ref = 'develop'), fails: ['checkout'] },
    { scenario: 'an action pinned by a tag', mutate: (wf) => (wf.jobs.translate.steps[1].uses = 'actions/setup-node@v4'), fails: ['checkout'] },
    { scenario: 'the API key in the workflow’s env', mutate: (wf) => (wf.env = { ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}' }), fails: ['secrets'] },
    { scenario: 'the job’s token on the install step', mutate: (wf) => ((wf.jobs.translate.steps[2].env ??= {}).GITHUB_TOKEN = '${{ github.token }}'), fails: ['secrets'] },
    { scenario: 'the API key from another secret', mutate: (wf) => (wf.jobs.translate.steps[3].env.ANTHROPIC_API_KEY = '${{ secrets.OTHER }}'), fails: ['secrets'] },
    { scenario: 'no step running l10n ci', mutate: (wf) => (wf.jobs.translate.steps[3].run = 'npm test'), fails: ['secrets'] },
  ];
  for (const row of rows) {
    it(`${row.scenario} breaks ${row.fails.join(' and ')}, and no other rule`, () => {
      const wf = clone();
      row.mutate(wf);
      expect(failing(wf)).toEqual(row.fails);
    });
  }

  it('the secret named a second time in the file breaks secrets, and no other rule', () => {
    const text = `${TEXT}# ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}\n`;
    expect(failing(readWorkflow(text), text)).toEqual(['secrets']);
  });
});

/** The collector's rules that report a problem, by name. */
const collectorFailing = (wf, text = COLLECTOR_TEXT) =>
  collectorProblems(wf, { working: CONTEXT.working, apiKeyEnv: CONTEXT.apiKeyEnv, text })
    .filter((r) => r.problems.length > 0)
    .map((r) => r.rule);

describe('a translation workflow run by hand alone', () => {
  const manual = () => {
    const wf = readWorkflow(TEXT);
    wf.on = { workflow_dispatch: null };
    return wf;
  };

  it('holds every rule, with no push and so no trigger paths', () => {
    expect(manualOnly(manual())).toBe(true);
    expect(failing(manual())).toEqual([]);
  });

  it('names the branch its checkout names, and none for an expression', () => {
    const wf = manual();
    expect(checkoutRef(wf)).toBe('main');
    wf.jobs.translate.steps[0].with.ref = '${{ github.ref_name }}';
    expect(checkoutRef(wf)).toBe(null);
  });

  it('breaks triggers with a manual dispatch carrying settings', () => {
    const wf = manual();
    wf.on.workflow_dispatch = { inputs: {} };
    expect(manualOnly(wf)).toBe(true);
    expect(failing(wf)).toEqual(['triggers']);
  });

  it('is not manual alone with a schedule beside its dispatch', () => {
    const wf = manual();
    wf.on.schedule = [{ cron: '0 * * * *' }];
    expect(manualOnly(wf)).toBe(false);
    expect(failing(wf)).toEqual(['triggers']);
  });
});

describe('the collector rules (one fault per row)', () => {
  it('the template collector holds every rule, and shares the translation workflow’s concurrency group', () => {
    expect(collectorFailing(readWorkflow(COLLECTOR_TEXT))).toEqual([]);
    expect(sharedGroupProblems(readWorkflow(TEXT), readWorkflow(COLLECTOR_TEXT))).toEqual([]);
  });

  const clone = () => readWorkflow(COLLECTOR_TEXT);
  const rows = [
    { scenario: 'a push trigger', mutate: (wf) => (wf.on.push = { branches: ['main'] }), fails: ['triggers'] },
    { scenario: 'an hourly schedule', mutate: (wf) => (wf.on.schedule = [{ cron: '0 * * * *' }]), fails: ['triggers'] },
    { scenario: 'no manual dispatch', mutate: (wf) => delete wf.on.workflow_dispatch, fails: ['triggers'] },
    { scenario: 'a pull-request trigger', mutate: (wf) => (wf.on.pull_request = null), fails: ['triggers', 'pull requests'] },
    { scenario: 'a further permission', mutate: (wf) => (wf.permissions['pull-requests'] = 'write'), fails: ['permissions'] },
    { scenario: 'a run in progress cancelled', mutate: (wf) => (wf.concurrency['cancel-in-progress'] = true), fails: ['concurrency'] },
    { scenario: 'a checkout of another branch', mutate: (wf) => (wf.jobs.translate.steps[0].with.ref = 'develop'), fails: ['checkout'] },
    { scenario: 'the API key on the install step', mutate: (wf) => ((wf.jobs.translate.steps[2].env ??= {}).ANTHROPIC_API_KEY = '${{ secrets.ANTHROPIC_API_KEY }}'), fails: ['secrets'] },
  ];
  for (const row of rows) {
    it(`${row.scenario} breaks ${row.fails.join(' and ')}, and no other rule`, () => {
      const wf = clone();
      row.mutate(wf);
      expect(collectorFailing(wf)).toEqual(row.fails);
    });
  }

  it('with no schedule, run by hand alone, it holds every rule', () => {
    const wf = clone();
    delete wf.on.schedule;
    expect(manualOnly(wf)).toBe(true);
    expect(collectorFailing(wf)).toEqual([]);
  });

  it('a concurrency group of its own breaks the shared group, naming both', () => {
    const wf = clone();
    wf.concurrency.group = 'collect';
    expect(collectorFailing(wf)).toEqual([]);
    expect(sharedGroupProblems(readWorkflow(TEXT), wf)).toEqual([
      'the collector\'s concurrency.group must be the translation workflow\'s, "l10n"; it is "collect"',
    ]);
  });
});
