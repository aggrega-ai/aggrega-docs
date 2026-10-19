import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli, COMMANDS } from './cli.mjs';
import { createStore } from './store.mjs';
import { keyOf } from './normalize.mjs';
import { LAYER } from './types.mjs';
import { createBackend } from './backends/anthropic.mjs';
import { capture, copyFixtureProject, fakeAnthropic, recordingBackend, recordingFs, writeJson } from '../test/helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/l10n.mjs', import.meta.url));

let project;
let configPath;

beforeEach(() => {
  project = copyFixtureProject();
  configPath = path.join(project, 'l10n.config.json');
});

afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
});

/** Runs a command in-process against the copied fixture project. */
async function run(argv, deps = {}) {
  const io = capture();
  const code = await runCli(argv, { cwd: project, env: {}, log: io.log, errlog: io.errlog, ...deps });
  return { code, out: io.text(), err: io.errors() };
}

/** Runs the real bin as a child process; never throws. */
function runBin(args, env = {}) {
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      cwd: project,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
    };
  }
}

function editConfig(mutate) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  mutate(cfg);
  writeJson(configPath, cfg);
}

function writeCatalog(sources) {
  const units = {};
  for (const s of sources) units[keyOf(s)] = { source: s, format: 'text', usages: [] };
  createStore({ baseDir: path.join(project, 'memory') }).writeSourceCatalog({ generated_at: 'x', source_lang: 'it', units });
}

describe('the command list', () => {
  it('npx l10n --help prints every command and exits 0 (the real bin)', () => {
    const r = runBin(['--help']);
    expect(r.code).toBe(0);
    for (const cmd of COMMANDS) expect(r.stdout).toMatch(new RegExp(`^  ${cmd} `, 'm'));
  });

  it('exits 2 with the usage when no command is given', async () => {
    const r = await run([]);
    expect(r.code).toBe(2);
    expect(r.out).toContain('Usage: l10n <command>');
  });

  it('exits 2 on an unknown command', async () => {
    const r = await run(['translat']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command: translat');
  });
});

describe('a defective configuration stops every command but doctor, naming the key, before content is read or a model is called', () => {
  const defects = [
    { scenario: 'an unknown key', mutate: (c) => (c.adapter.content.sourceDir = 'content/{lang}'), names: 'adapter.content.sourceDir: unknown key' },
    { scenario: 'a wrongly typed value', mutate: (c) => (c.memory.dir = ['memory']), names: 'memory.dir: Expected string, received array' },
  ];

  for (const defect of defects) {
    it(`${defect.scenario} → \`doctor\` reports it as its failed configuration check and exits 1, reading nothing else`, async () => {
      editConfig(defect.mutate);
      const backend = recordingBackend();
      const { reads, fsImpl } = recordingFs();
      const r = await run(['doctor'], { fsImpl, backend, env: { ANTHROPIC_API_KEY: 'k' } });
      expect(r.code).toBe(1);
      expect(r.out).toMatch(new RegExp(`^ {2}FAIL +configuration: .*${defect.names.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
      expect([...new Set(reads)]).toEqual([configPath]);
      expect(backend.calls).toHaveLength(0);
    });

    for (const cmd of COMMANDS.filter((c) => c !== 'doctor')) {
      it(`${defect.scenario} → \`${cmd}\` exits non-zero`, async () => {
        editConfig(defect.mutate);
        const backend = recordingBackend();
        const { reads, fsImpl } = recordingFs();
        const r = await run([cmd], { fsImpl, backend, env: { ANTHROPIC_API_KEY: 'k' } });
        expect(r.code).toBe(2);
        expect(r.err).toContain(defect.names);
        // The only file the command looked at is the configuration itself.
        expect([...new Set(reads)]).toEqual([configPath]);
        expect(backend.calls).toHaveLength(0);
        expect(fs.existsSync(path.join(project, 'memory', 'source.json'))).toBe(false);
      });
    }
  }
});

describe('the VITE_ refusal: a command that would call a model exits non-zero and makes no call', () => {
  for (const cmd of ['translate', 'pipeline']) {
    it(`\`${cmd}\` with a recording backend`, async () => {
      editConfig((c) => (c.backend.apiKeyEnv = 'VITE_ANTHROPIC_API_KEY'));
      writeCatalog(['Uno']);
      const backend = recordingBackend();
      const r = await run([cmd], { backend, env: { VITE_ANTHROPIC_API_KEY: 'secret' } });
      expect(r.code).toBe(2);
      expect(r.err).toContain('backend.apiKeyEnv: "VITE_ANTHROPIC_API_KEY" begins with VITE_');
      expect(r.err).toContain("Refused by the rule that a secret's variable name never carries the VITE_ prefix");
      expect(backend.calls).toHaveLength(0);
    });

    it(`\`${cmd}\` with the SDK backend over a fake client class`, async () => {
      editConfig((c) => (c.backend.apiKeyEnv = 'VITE_ANTHROPIC_API_KEY'));
      writeCatalog(['Uno']);
      const fake = fakeAnthropic();
      const backend = createBackend({ ClientClass: fake.FakeAnthropic });
      const r = await run([cmd], { backend, ClientClass: fake.FakeAnthropic, env: { VITE_ANTHROPIC_API_KEY: 'secret' } });
      expect(r.code).toBe(2);
      expect(r.err).toContain('begins with VITE_');
      expect(fake.constructed).toHaveLength(0);
    });
  }

  for (const cmd of ['submit', 'collect']) {
    it(`\`${cmd}\` exits non-zero and constructs no client`, async () => {
      editConfig((c) => (c.backend.apiKeyEnv = 'VITE_ANTHROPIC_API_KEY'));
      const fake = fakeAnthropic();
      const r = await run([cmd], { ClientClass: fake.FakeAnthropic, env: { VITE_ANTHROPIC_API_KEY: 'secret' } });
      expect(r.code).toBe(2);
      expect(r.err).toContain('backend.apiKeyEnv: "VITE_ANTHROPIC_API_KEY" begins with VITE_');
      expect(fake.constructed).toHaveLength(0);
    });
  }
});

describe('backend selection', () => {
  it('I18N_BACKEND=claude-cli: translate exits non-zero naming the supported backend (the real bin)', () => {
    writeCatalog(['Uno']);
    const r = runBin(['translate'], { I18N_BACKEND: 'claude-cli' });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('I18N_BACKEND="claude-cli" is not a supported translation backend; supported: anthropic, claude-code.');
    expect(fs.existsSync(path.join(project, 'memory', 'jobs'))).toBe(false);
  });

  it('I18N_BACKEND=claude-cli is refused before an injected backend is called', async () => {
    writeCatalog(['Uno']);
    const backend = recordingBackend();
    const r = await run(['translate'], { backend, env: { I18N_BACKEND: 'claude-cli', ANTHROPIC_API_KEY: 'k' } });
    expect(r.code).toBe(2);
    expect(backend.calls).toHaveLength(0);
  });

  it('I18N_BACKEND=anthropic is accepted', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const backend = recordingBackend();
    const r = await run(['translate'], { backend, env: { I18N_BACKEND: 'anthropic' } });
    expect(r.code).toBe(0);
    // One request per page: the content file and the UI dictionary.
    expect(backend.calls).toHaveLength(2);
  });

  it('I18N_BACKEND=claude-cli is refused before submit builds anything', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const fake = fakeAnthropic();
    const r = await run(['submit'], { ClientClass: fake.FakeAnthropic, env: { I18N_BACKEND: 'claude-cli', ANTHROPIC_API_KEY: 'k' } });
    expect(r.code).toBe(2);
    expect(r.err).toContain('I18N_BACKEND="claude-cli" is not a supported translation backend; supported: anthropic, claude-code.');
    expect(fake.constructed).toHaveLength(0);
  });
});

describe('the locale set comes from the file the configuration names', () => {
  it('a target added to the scratch locales file is in the default targets', async () => {
    writeJson(path.join(project, 'locales.json'), { source: 'it', targets: ['en', 'de'] });
    writeCatalog(['Uno']);
    const r = await run(['gate']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('  targets: en, de');
  });

  it('--targets narrows the default', async () => {
    writeJson(path.join(project, 'locales.json'), { source: 'it', targets: ['en', 'de'] });
    writeCatalog(['Uno']);
    const r = await run(['gate', '--targets', 'de']);
    expect(r.out).toContain('  targets: de');
  });
});

describe('gate --check', () => {
  it('exits 0 with nothing to translate', async () => {
    const r = await run(['gate', '--check']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('no translation needed');
  });

  it('exits 1 while work remains', async () => {
    writeCatalog(['Uno']);
    const r = await run(['gate', '--check']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 strings, 1 language slots to translate');
  });

  it('does not fail without --check, even when work remains', async () => {
    writeCatalog(['Uno']);
    expect((await run(['gate'])).code).toBe(0);
  });

  it('finds the configuration from a subdirectory, as `npm run` from anywhere in the project would', async () => {
    const sub = path.join(project, 'content', 'it');
    const io = capture();
    const code = await runCli(['gate', '--check'], { cwd: sub, env: {}, log: io.log, errlog: io.errlog });
    expect(code).toBe(0);
    expect(io.text()).toContain('no translation needed');
  });
});

describe('translate through the command line', () => {
  it('translates every missing unit, one request per page, with no --conc given', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const backend = recordingBackend();
    const r = await run(['translate'], { backend, engineOptions: { sleep: () => Promise.resolve() } });
    expect(r.code).toBe(0);
    expect(r.out).toContain('translated=6, failed=0');
    const missing = ['Benvenuti', 'Una pagina di prova', 'Scopri', 'Primo paragrafo.', 'Torna su', 'Menu'].map(keyOf);
    expect(backend.calls.flatMap((c) => c.ids).sort()).toEqual(missing.sort());
  });

  it('a missing prompt file stops translate before any request, naming the file', async () => {
    expect((await run(['extract'])).code).toBe(0);
    fs.rmSync(path.join(project, 'memory', 'prompts', 'en.md'));
    const backend = recordingBackend();
    const r = await run(['translate'], { backend });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`${path.join(project, 'memory', 'prompts', 'en.md')}: the per-language prompt file for "en" is missing`);
    expect(backend.calls).toHaveLength(0);
  });

  it('an empty general prompt file stops translate and submit before any request, naming the file', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const file = path.join(project, 'memory', 'prompts', '_general.md');
    fs.writeFileSync(file, '\n');
    const backend = recordingBackend();
    const translated = await run(['translate'], { backend });
    expect(translated.code).toBe(2);
    expect(translated.err).toContain(`${file}: the general prompt file is empty`);
    expect(backend.calls).toHaveLength(0);
    const fake = fakeAnthropic();
    const submitted = await run(['submit'], { env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic });
    expect(submitted.code).toBe(2);
    expect(submitted.err).toContain(`${file}: the general prompt file is empty`);
    expect(fake.constructed).toHaveLength(0);
  });

  // Each row one value that is not a matching mode; a typo must never fall back to case-insensitive matching.
  const unknownModes = [
    { scenario: 'a capitalized mode', value: 'Sensitive' },
    { scenario: 'another word', value: 'case-sensitive' },
    { scenario: 'a boolean', value: true },
  ];
  for (const row of unknownModes) {
    it(`a do_not_translate_case that is not a matching mode stops translate, submit, submit --dry-run and collect with exit 2 before any request, naming the glossary file and the key — ${row.scenario}`, async () => {
      expect((await run(['extract'])).code).toBe(0);
      const file = path.join(project, 'glossary.json');
      const glossary = JSON.parse(fs.readFileSync(file, 'utf8'));
      writeJson(file, { ...glossary, do_not_translate_case: row.value });
      const named = `${file}: the glossary's "do_not_translate_case" is ${JSON.stringify(row.value)}`;
      const backend = recordingBackend();
      const translated = await run(['translate'], { backend });
      expect(translated.code).toBe(2);
      expect(translated.err).toContain(named);
      expect(backend.calls).toHaveLength(0);
      for (const argv of [['submit'], ['submit', '--dry-run'], ['collect']]) {
        const fake = fakeAnthropic();
        const r = await run(argv, { env: { ANTHROPIC_API_KEY: 'k' }, ClientClass: fake.FakeAnthropic });
        expect(r.code).toBe(2);
        expect(r.err).toContain(named);
        expect(r.out).not.toContain('estimated input');
        expect(fake.constructed).toHaveLength(0);
      }
    });
  }

  it('(b) leaves the human file byte-identical while the machine file gains the entries', async () => {
    const humanFile = path.join(project, 'memory', 'messages', 'en.json');
    const machineFile = path.join(project, 'memory', 'machine', 'en.json');
    const humanBefore = fs.readFileSync(humanFile);
    expect(fs.existsSync(machineFile)).toBe(false);
    expect((await run(['extract'])).code).toBe(0);

    const backend = recordingBackend();
    const r = await run(['translate'], { backend });

    expect(r.code).toBe(0);
    expect(fs.readFileSync(humanFile).equals(humanBefore)).toBe(true);
    const machine = JSON.parse(fs.readFileSync(machineFile, 'utf8'));
    // Every unit except the one the human layer already carries.
    expect(Object.keys(machine)).toContain(keyOf('Benvenuti'));
    expect(Object.keys(machine)).not.toContain(keyOf('Ciao mondo'));
    expect(Object.values(machine).every((e) => e.status === 'machine')).toBe(true);
  });
});

describe('seed through the command line', () => {
  it('(c) of the two layers, only the human file changes', async () => {
    const humanFile = path.join(project, 'memory', 'messages', 'en.json');
    const machineFile = path.join(project, 'memory', 'machine', 'en.json');
    writeJson(machineFile, {
      [keyOf('Scopri')]: { text: 'Find out (machine)', status: 'machine', srcHash: keyOf('Scopri') },
    });
    const humanBefore = fs.readFileSync(humanFile);
    const machineBefore = fs.readFileSync(machineFile);

    const r = await run(['seed']);

    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^seed: \d+ entries imported \(en\)\.$/m);
    expect(fs.readFileSync(machineFile).equals(machineBefore)).toBe(true);
    expect(fs.readFileSync(humanFile).equals(humanBefore)).toBe(false);
    const humanLayer = JSON.parse(fs.readFileSync(humanFile, 'utf8'));
    expect(humanLayer[keyOf('Benvenuti')]).toMatchObject({ text: 'Welcome', status: 'seed' });
    // The entry a person wrote is kept, not replaced by the hand-written target's text.
    expect(humanLayer[keyOf('Ciao mondo')]).toMatchObject({ text: 'Hello, world', status: 'human' });
    // The report sits beside the memory.
    expect(JSON.parse(fs.readFileSync(path.join(project, 'memory', 'seed-report.json'), 'utf8')).lang).toBe('en');
  });

  it('refuses to seed two target locales in one run, naming the flag', async () => {
    writeJson(path.join(project, 'locales.json'), { source: 'it', targets: ['en', 'de'] });
    await expect(run(['seed'])).rejects.toThrow(/one target locale per run.*--targets/);
  });
});

describe('the other commands against the fixture project', () => {
  it('extract → generate → materialize → verify-drift, with a hand edit caught and named', async () => {
    expect((await run(['extract'])).code).toBe(0);
    const gen = await run(['generate']);
    expect(gen.code).toBe(0);
    expect(fs.existsSync(path.join(project, 'memory', 'generated', 'content', 'en', 'home.json'))).toBe(true);

    const mat = await run(['materialize']);
    expect(mat.code).toBe(0);
    expect(mat.out).toContain('ui-dictionary: 1 file(s) written');
    expect(mat.out).toContain('content: 1 file(s) written');

    const clean = await run(['verify-drift']);
    expect(clean.code).toBe(0);
    expect(clean.out).toContain('anti-drift: no divergence');

    const target = path.join(project, 'content', 'en', 'home.json');
    const page = JSON.parse(fs.readFileSync(target, 'utf8'));
    page.blocks[0].data.heading = 'Hand-edited heading';
    writeJson(target, page);
    const dirty = await run(['verify-drift']);
    expect(dirty.code).toBe(1);
    expect(dirty.out).toContain('en/home.json');
  });

  it('gc runs off the memory alone', async () => {
    writeJson(path.join(project, 'memory', 'machine', 'en.json'), {
      orphan: { text: 'x', status: 'machine', srcHash: 'orphan' },
    });
    const r = await run(['gc']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('orphaned keys in total');
  });

  it('pipeline with nothing to translate makes no backend call and exits 0', async () => {
    // Seed the human layer so every unit is covered, then run the pipeline.
    expect((await run(['seed'])).code).toBe(0);
    const humanFile = path.join(project, 'memory', 'messages', 'en.json');
    const humanLayer = JSON.parse(fs.readFileSync(humanFile, 'utf8'));
    for (const s of ['Torna su', 'Menu', 'Primo paragrafo.', 'Scopri', 'Una pagina di prova']) {
      humanLayer[keyOf(s)] = humanLayer[keyOf(s)] || { text: s, status: 'seed', srcHash: keyOf(s) };
    }
    writeJson(humanFile, humanLayer);
    const backend = recordingBackend();
    const r = await run(['pipeline'], { backend });
    expect(r.out).toContain('[pipeline] gate: no translation needed');
    expect(r.code).toBe(0);
    expect(backend.calls).toHaveLength(0);
  });
});
