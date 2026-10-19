/**
 * pre-push-hook.test.mjs — The json-site example's local-mode wiring end to
 * end, in a temporary repository with a bare remote: its `prepare` script arms
 * its `.githooks/pre-push`, a push of an untranslated commit is refused with
 * the push check's message and leaves the remote as it was, and once the
 * translation is committed the push succeeds.
 *
 * READS the example and the package. WRITES only a git sandbox in a temporary
 * directory — the repository, its bare remote, an npm cache and a home with an
 * empty git configuration — and links the package into the repository's
 * `node_modules`, as installing it does. The hook runs `npx --no`, which finds
 * the linked command and installs nothing; npm runs offline. The translation is
 * made by `l10n local` in this process with the fake SDK client class: no
 * request leaves the process, and git, npx and the check never call a model.
 */

import { networkAttempts } from './no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from '../src/cli.mjs';
import { capture, EXAMPLES, fakeAnthropic, gitSandbox } from './helpers.mjs';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

let box;
let site;
let remote;
let env;

beforeEach(() => {
  box = gitSandbox('l10n-hook-');
  site = path.join(box.dir, 'site');
  remote = path.join(box.dir, 'remote.git');
  fs.cpSync(path.join(EXAMPLES, 'json-site'), site, { recursive: true });
  // What installing the package leaves: the package under node_modules, and its command on the path of npm's commands.
  fs.mkdirSync(path.join(site, 'node_modules', '@aggrega-ai'), { recursive: true });
  fs.symlinkSync(PACKAGE, path.join(site, 'node_modules', '@aggrega-ai', 'l10n'), 'dir');
  fs.mkdirSync(path.join(site, 'node_modules', '.bin'));
  fs.symlinkSync(path.join('..', '@aggrega-ai', 'l10n', 'bin', 'l10n.mjs'), path.join(site, 'node_modules', '.bin', 'l10n'));
  env = {
    ...box.env,
    npm_config_cache: path.join(box.dir, 'npm-cache'),
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  };
  box.git(['init', '--quiet', '--bare', '-b', 'main', remote]);
  box.git(['init', '--quiet', '-b', 'main'], site);
  fs.appendFileSync(path.join(site, '.git', 'info', 'exclude'), 'node_modules/\n');
  box.git(['remote', 'add', 'origin', `file://${remote}`], site);
});
afterEach(() => box.cleanup());

const git = (args) => spawnSync('git', args, { cwd: site, env, encoding: 'utf8' });
const remoteRef = () => spawnSync('git', ['--git-dir', remote, 'rev-parse', '--verify', '--quiet', 'refs/heads/main'], { env, encoding: 'utf8' }).stdout.trim();

describe('the json-site example’s pre-push hook', () => {
  it('is armed by the prepare script, refuses an untranslated push with the message, and lets the translated one through', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(site, 'package.json'), 'utf8'));
    const prepare = spawnSync('sh', ['-c', manifest.scripts.prepare], { cwd: site, env, encoding: 'utf8' });
    expect(prepare.status).toBe(0);
    expect(box.git(['config', '--get', 'core.hooksPath'], site)).toBe('.githooks');

    box.git(['add', '-A'], site);
    box.git(['commit', '--quiet', '-m', 'Site content'], site);
    const before = networkAttempts().length;

    const refused = git(['push', 'origin', 'main']);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain('is not fully translated:');
    expect(refused.stderr).toMatch(/ {2}it: \d+ units missing on 3 pages/);
    expect(refused.stderr).toMatch(/ {2}de: \d+ units missing on 3 pages/);
    expect(refused.stderr).toContain('prepush: the push is refused. Next:\n  1. npm run i18n:local\n  2. git add -- i18n/machine/ content/it/ content/de/ ui/it.json ui/de.json\n  3. git commit');
    expect(remoteRef()).toBe('');

    const fake = fakeAnthropic();
    const io = capture();
    const code = await runCli(['local', '--config', 'l10n.local.json'], {
      cwd: site,
      env: { ...env, ANTHROPIC_API_KEY: 'test-key' },
      ClientClass: fake.FakeAnthropic,
      sleep: async () => {},
      runCommand: (command, opts) => spawnSync(command, { cwd: opts.cwd, env, shell: true, encoding: 'utf8' }),
      log: io.log,
      errlog: io.errlog,
    });
    expect(io.errors()).toBe('');
    expect(code).toBe(0);
    expect(fake.calls.batchCreate).toHaveLength(1);
    expect(box.git(['diff', '--cached', '--name-only'], site)).toBe('');

    box.git(['add', '--', 'i18n/machine/', 'content/it/', 'content/de/', 'ui/it.json', 'ui/de.json'], site);
    box.git(['commit', '--quiet', '-m', 'Translate'], site);
    const pushed = git(['push', 'origin', 'main']);
    expect(pushed.stdout).toContain('prepush: the pushed commit is fully translated.');
    expect(pushed.status).toBe(0);
    expect(remoteRef()).toBe(box.git(['rev-parse', 'HEAD'], site));
    expect(networkAttempts().slice(before)).toEqual([]);
  }, 60000);
});
