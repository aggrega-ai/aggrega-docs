import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { loadConfig } from './config.mjs';
import { checkTriggerPaths } from './doctor.mjs';
import {
  checkPermissionProblems,
  checkPullRequestProblems,
  checkSecretProblems,
  checkStepProblems,
  checkTriggerProblems,
  checkWorkflowProblems,
  readWorkflow,
} from './workflow.mjs';
import { EXAMPLES } from '../test/helpers.mjs';

/**
 * check-workflow.test.mjs — The check workflow's rules (`workflow.mjs`), on the
 * json-site example's local-mode template as shipped and with each rule broken
 * in a copy of the object read from it.
 *
 * READS the template and the example's local-mode configuration. WRITES nothing.
 */

const ROOT = path.join(EXAMPLES, 'json-site');
const TEXT = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'l10n-check.yml'), 'utf8');
const PROJECT = loadConfig({ configPath: path.join(ROOT, 'l10n.local.json') });
const PATHS = checkTriggerPaths(PROJECT, ROOT);
const ARGS = { paths: PATHS, config: 'l10n.local.json' };

/** A fresh copy of the template, read. */
const template = () => readWorkflow(TEXT);
const stepNamed = (wf, name) => wf.jobs.check.steps.find((s) => s.name === name);
const CHECK = 'Check that the pushed commit is fully translated';

describe('the check workflow template', () => {
  it('holds every rule, for the paths its configuration implies', () => {
    expect(PATHS).toEqual(['content/en/**', 'ui/en.json', 'i18n/**', 'content/it/**', 'content/de/**', 'ui/it.json', 'ui/de.json']);
    expect(checkWorkflowProblems(template(), ARGS)).toEqual([
      { rule: 'triggers', problems: [] },
      { rule: 'pull requests', problems: [] },
      { rule: 'permissions', problems: [] },
      { rule: 'steps', problems: [] },
      { rule: 'secrets', problems: [] },
    ]);
  });
});

/** Each row breaks one rule in a copy of the template; the rule's problems must name the defect, and every other rule stays clean. */
const BROKEN = [
  { name: 'a branch filter on the push', rule: checkTriggerProblems, args: { paths: PATHS }, edit: (wf) => (wf.on.push.branches = ['main']), expect: /on\.push must be/ },
  { name: 'a trigger path missing', rule: checkTriggerProblems, args: { paths: PATHS }, edit: (wf) => wf.on.push.paths.pop(), expect: /on\.push must be/ },
  { name: 'a schedule', rule: checkTriggerProblems, args: { paths: PATHS }, edit: (wf) => (wf.on.schedule = [{ cron: '0 * * * *' }]), expect: /on must hold push and workflow_dispatch and nothing else/ },
  { name: 'no manual dispatch', rule: checkTriggerProblems, args: { paths: PATHS }, edit: (wf) => delete wf.on.workflow_dispatch, expect: /on must hold push and workflow_dispatch/ },
  { name: 'pull_request_target', rule: checkPullRequestProblems, args: undefined, edit: (wf) => (wf.on.pull_request_target = null), expect: /on\.pull_request_target must be absent/ },
  { name: 'contents: write', rule: checkPermissionProblems, args: undefined, edit: (wf) => (wf.permissions.contents = 'write'), expect: /permissions must be \{"contents":"read"\}/ },
  { name: 'a second permission', rule: checkPermissionProblems, args: undefined, edit: (wf) => (wf.permissions.actions = 'read'), expect: /permissions must be \{"contents":"read"\}/ },
  { name: 'job-level permissions', rule: checkPermissionProblems, args: undefined, edit: (wf) => (wf.jobs.check.permissions = { contents: 'read' }), expect: /jobs\.check\.permissions must be absent/ },
  { name: 'a checkout that persists its credential', rule: checkStepProblems, args: { config: 'l10n.local.json' }, edit: (wf) => (wf.jobs.check.steps[0].with['persist-credentials'] = true), expect: /persist-credentials/ },
  { name: 'an action pinned by tag', rule: checkStepProblems, args: { config: 'l10n.local.json' }, edit: (wf) => (wf.jobs.check.steps[1].uses = 'actions/setup-node@v4'), expect: /must be pinned by a full commit/ },
  { name: 'the check without the pushed commit', rule: checkStepProblems, args: { config: 'l10n.local.json' }, edit: (wf) => (stepNamed(wf, CHECK).run = 'npx --no l10n prepush --config l10n.local.json'), expect: /must pass the pushed commit/ },
  { name: 'the check without --config', rule: checkStepProblems, args: { config: 'l10n.local.json' }, edit: (wf) => (stepNamed(wf, CHECK).run = 'npx --no l10n prepush "$GITHUB_SHA"'), expect: /must pass --config l10n\.local\.json/ },
  { name: 'no check step', rule: checkStepProblems, args: { config: 'l10n.local.json' }, edit: (wf) => (stepNamed(wf, CHECK).run = 'npm test'), expect: /exactly one step that runs `l10n prepush`; it holds 0/ },
  { name: 'no install step', rule: checkStepProblems, args: { config: 'l10n.local.json' }, edit: (wf) => (stepNamed(wf, 'Install').name = 'Dependencies'), expect: /a step named Install/ },
  { name: 'the secret in the check step', rule: checkSecretProblems, args: undefined, edit: (wf) => (stepNamed(wf, CHECK).env = { ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}' }), expect: /the step "Check that the pushed commit is fully translated" must not read a secret/ },
  { name: 'the job token in the check step', rule: checkSecretProblems, args: undefined, edit: (wf) => (stepNamed(wf, CHECK).env = { GITHUB_TOKEN: '${{ github.token }}' }), expect: /must not read a secret or github\.token/ },
  { name: 'a secret in an action’s with', rule: checkSecretProblems, args: undefined, edit: (wf) => (wf.jobs.check.steps[0].with.token = '${{ secrets.L10N_REPO_TOKEN }}'), expect: /the step "actions\/checkout@[0-9a-f]+" must not read a secret/ },
  { name: 'a secret at the workflow level', rule: checkSecretProblems, args: undefined, edit: (wf) => (wf.env = { TOKEN: '${{ secrets.L10N_REPO_TOKEN }}' }), expect: /at the workflow level/ },
  { name: 'a secret at the job level', rule: checkSecretProblems, args: undefined, edit: (wf) => (wf.jobs.check.env = { TOKEN: '${{ secrets.L10N_REPO_TOKEN }}' }), expect: /in jobs\.check outside its steps/ },
];

describe('each broken rule is named', () => {
  for (const row of BROKEN) {
    it(`${row.name}`, () => {
      expect(row.rule(template(), row.args)).toEqual([]);
      const wf = template();
      row.edit(wf);
      const found = row.rule(wf, row.args);
      expect(found.some((p) => row.expect.test(p))).toBe(true);
    });
  }

  it('the install step may carry a project’s private dependency’s token', () => {
    const wf = template();
    (stepNamed(wf, 'Install').env ??= {}).CONSENT_REPO_TOKEN = '${{ secrets.CONSENT_REPO_TOKEN }}';
    expect(checkSecretProblems(wf)).toEqual([]);
  });
});
