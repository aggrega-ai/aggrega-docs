import '../test/no-network.mjs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ConfigError,
  DEFAULT_API_KEY_ENV,
  DEFAULT_MODEL,
  DEFAULT_SYNC_TOKEN_ENV,
  DEFAULT_WORKFLOW_FILE,
  SYNC_DEFAULTS,
  TRANSLATION_DEFAULTS,
  expandLang,
  findConfigPath,
  loadConfig,
  parseConfig,
  syncSettings,
  translationSettings,
} from './config.mjs';
import { fixtureConfig, writeJson } from '../test/helpers.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-config-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** The fixture configuration with one change applied by `mutate`. */
function variant(mutate) {
  const cfg = fixtureConfig();
  mutate(cfg);
  return cfg;
}

describe('parseConfig — a valid configuration', () => {
  it('accepts the fixture and applies the backend defaults', () => {
    const cfg = parseConfig(fixtureConfig());
    expect(cfg.backend).toEqual({ kind: 'anthropic', apiKeyEnv: DEFAULT_API_KEY_ENV });
    expect(cfg.adapter.kind).toBe('json-content');
  });

  it('supplies the whole backend key when it is omitted', () => {
    const cfg = parseConfig(variant((c) => delete c.backend));
    expect(cfg.backend).toEqual({ kind: 'anthropic', apiKeyEnv: 'ANTHROPIC_API_KEY' });
  });

  it('accepts a CI section, with and without a dispatch, and adds no default to it', () => {
    const full = { branch: 'l10n-memory', dispatch: { workflow: 'deploy-dev.yml', ref: 'lovable' } };
    expect(parseConfig(variant((c) => (c.ci = full))).ci).toEqual(full);
    expect(parseConfig(variant((c) => (c.ci = { branch: 'ci/memory' }))).ci).toEqual({ branch: 'ci/memory' });
    expect(parseConfig(fixtureConfig()).ci).toBeUndefined();
  });

  it('accepts the translation workflow’s file name, and leaves its default to doctor', () => {
    expect(parseConfig(variant((c) => (c.ci = { branch: 'l10n-memory', workflow: 'translate.yaml' }))).ci).toEqual({
      branch: 'l10n-memory',
      workflow: 'translate.yaml',
    });
    expect(DEFAULT_WORKFLOW_FILE).toBe('l10n.yml');
  });

  it('accepts the collector’s file name, and gives it no default', () => {
    const ci = { branch: 'l10n-memory', collector: 'l10n-collect.yml' };
    expect(parseConfig(variant((c) => (c.ci = ci))).ci).toEqual(ci);
    expect(parseConfig(variant((c) => (c.ci = { branch: 'l10n-memory' }))).ci).not.toHaveProperty('collector');
  });

  it('accepts a sync section as stated, and resolves its defaults in syncSettings alone', () => {
    const sync = { commands: ['npm run i18n:materialize'], paths: ['content/en/'], tokenEnv: 'SITE_READ_TOKEN', intervalSeconds: 120 };
    const cfg = parseConfig(variant((c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = sync))));
    expect(cfg.sync).toEqual(sync);
    expect(syncSettings(cfg.sync)).toEqual(sync);
    expect(parseConfig(variant((c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = {})))).sync).toEqual({});
    expect(syncSettings({})).toEqual({ commands: [], paths: [], tokenEnv: DEFAULT_SYNC_TOKEN_ENV, intervalSeconds: SYNC_DEFAULTS.intervalSeconds });
    expect(syncSettings()).toEqual(syncSettings({}));
    expect(DEFAULT_SYNC_TOKEN_ENV).toBe('L10N_GIT_READ_TOKEN');
    expect(SYNC_DEFAULTS.intervalSeconds).toBe(300);
  });
});

describe('parseConfig — every defect names its key (one fault per row)', () => {
  const rows = [
    { scenario: 'an unknown top-level key', mutate: (c) => (c.extra = 1), names: 'extra: unknown key' },
    { scenario: 'an unknown nested key', mutate: (c) => (c.memory.layers = 2), names: 'memory.layers: unknown key' },
    {
      scenario: 'an unknown key deep in the field rules',
      mutate: (c) => (c.adapter.fields.valueGuards.excludeDates = true),
      names: 'adapter.fields.valueGuards.excludeDates: unknown key',
    },
    { scenario: 'a wrongly typed value', mutate: (c) => (c.memory.dir = 42), names: 'memory.dir: Expected string, received number' },
    {
      scenario: 'a wrongly typed list',
      mutate: (c) => (c.adapter.fields.denylistKeys = 'image'),
      names: 'adapter.fields.denylistKeys: Expected array, received string',
    },
    {
      scenario: 'a wrongly typed flag',
      mutate: (c) => (c.adapter.fields.valueGuards.excludeNumbers = 'yes'),
      names: 'adapter.fields.valueGuards.excludeNumbers: Expected boolean, received string',
    },
    { scenario: 'a missing required key', mutate: (c) => delete c.memory, names: 'memory: Required' },
    {
      scenario: 'an unsupported adapter kind',
      mutate: (c) => (c.adapter.kind = 'restructured-text'),
      names: 'adapter.kind: Invalid discriminator value',
    },
    {
      scenario: 'an unsupported backend kind',
      mutate: (c) => (c.backend.kind = 'claude-cli'),
      names: 'backend.kind: Invalid discriminator value',
    },
    {
      scenario: 'a per-locale path without the placeholder',
      mutate: (c) => (c.adapter.content.staging = 'memory/generated/content'),
      names: 'adapter.content.staging: must contain the {lang} placeholder',
    },
    {
      scenario: 'an asset extension written with its dot',
      mutate: (c) => (c.adapter.fields.valueGuards.assetExtensions = ['.png']),
      names: 'adapter.fields.valueGuards.assetExtensions.0: must be a bare file extension',
    },
    {
      scenario: 'a locale set of the wrong shape',
      mutate: (c) => (c.locales = 7),
      names: 'locales: expected a path to a locale declaration',
    },
    {
      scenario: 'an API-key variable that is not a variable name',
      mutate: (c) => (c.backend.apiKeyEnv = 'ANTHROPIC API KEY'),
      names: 'backend.apiKeyEnv: must be an environment-variable name',
    },
    {
      scenario: 'a model object of the wrong shape',
      mutate: (c) => (c.backend.model = { name: 'claude-opus-5-5' }),
      names: 'backend.model: expected a model id, or { "id", "thinking"?, "effort"?, "fallbackId"? }',
    },
    {
      scenario: 'an effort the API does not define',
      mutate: (c) => (c.backend.model = { id: 'claude-opus-5-5', effort: 'minimal' }),
      names: 'backend.model: expected a model id',
    },
    {
      scenario: 'a thinking setting that takes no other field',
      mutate: (c) => (c.backend.model = { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools', display: 'summarized' } }),
      names: 'backend.model.thinking.display: unknown key',
    },
    {
      scenario: 'a per-submission budget that is not a positive integer',
      mutate: (c) => (c.backend.submission = { inputTokens: 0, outputTokens: 1000 }),
      names: 'backend.submission.inputTokens: Number must be greater than 0',
    },
    {
      scenario: 'an unknown key in the per-submission budgets',
      mutate: (c) => (c.backend.submission = { inputTokens: 1, outputTokens: 1, dollars: 5 }),
      names: 'backend.submission.dollars: unknown key',
    },
    {
      scenario: 'an attempt limit that is not an integer',
      mutate: (c) => (c.backend.attempts = 2.5),
      names: 'backend.attempts: Expected integer, received float',
    },
    { scenario: 'a CI section with no branch', mutate: (c) => (c.ci = {}), names: 'ci.branch: Required' },
    { scenario: 'an unknown key in the CI section', mutate: (c) => (c.ci = { branch: 'l10n-memory', push: true }), names: 'ci.push: unknown key' },
    { scenario: 'a CI branch git refuses', mutate: (c) => (c.ci = { branch: 'l10n..memory' }), names: 'ci.branch: is not a valid git branch name' },
    {
      scenario: 'a dispatch naming no workflow file',
      mutate: (c) => (c.ci = { branch: 'l10n-memory', dispatch: { workflow: 'deploy-dev', ref: 'lovable' } }),
      names: 'ci.dispatch.workflow: must be a workflow file name',
    },
    {
      scenario: 'a translation workflow named with its directory',
      mutate: (c) => (c.ci = { branch: 'l10n-memory', workflow: '.github/workflows/l10n.yml' }),
      names: 'ci.workflow: must be a workflow file name',
    },
    {
      scenario: 'a collector named with its directory',
      mutate: (c) => (c.ci = { branch: 'l10n-memory', collector: '.github/workflows/l10n-collect.yml' }),
      names: 'ci.collector: must be a workflow file name',
    },
    {
      scenario: 'a collector that is the translation workflow, by its default name',
      mutate: (c) => (c.ci = { branch: 'l10n-memory', collector: 'l10n.yml' }),
      names: 'ci.collector: must differ from the translation workflow ("l10n.yml")',
    },
    {
      scenario: 'a collector that is the dispatched workflow',
      mutate: (c) => (c.ci = { branch: 'l10n-memory', collector: 'deploy-dev.yml', dispatch: { workflow: 'deploy-dev.yml', ref: 'lovable' } }),
      names: 'ci.collector: must differ from the translation workflow ("l10n.yml") and from ci.dispatch.workflow',
    },
    {
      scenario: 'a CI branch equal to the dispatch ref, the working branch',
      mutate: (c) => (c.ci = { branch: 'lovable', dispatch: { workflow: 'deploy-dev.yml', ref: 'lovable' } }),
      names: 'ci.branch: must differ from ci.dispatch.ref ("lovable")',
    },
    {
      scenario: 'a sync section without the CI section it reads',
      mutate: (c) => (c.sync = { paths: ['content/en/'] }),
      names: 'sync: needs the "ci" key: the sync reads the branch ci.branch names',
    },
    {
      scenario: 'an unknown key in the sync section',
      mutate: (c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { push: true })),
      names: 'sync.push: unknown key',
    },
    {
      scenario: 'a derived path outside the project',
      mutate: (c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { paths: ['../other/site-data.json'] })),
      names: 'sync.paths.0: must be a path inside the project: relative to the configuration file, with no ".." segment',
    },
    {
      scenario: 'an absolute derived path',
      mutate: (c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { paths: ['/etc/passwd'] })),
      names: 'sync.paths.0: must be a path inside the project',
    },
    {
      scenario: 'a derived command that is not a string',
      mutate: (c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { commands: [['npm', 'run', 'prebuild']] })),
      names: 'sync.commands.0: Expected string, received array',
    },
    {
      scenario: 'a token variable that is not a variable name',
      mutate: (c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { tokenEnv: 'READ TOKEN' })),
      names: 'sync.tokenEnv: must be an environment-variable name',
    },
    {
      scenario: 'a poll interval that is not a positive integer',
      mutate: (c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { intervalSeconds: 0 })),
      names: 'sync.intervalSeconds: Number must be greater than 0',
    },
  ];

  for (const row of rows) {
    it(row.scenario, () => {
      let thrown;
      try {
        parseConfig(variant(row.mutate), { file: 'l10n.config.json' });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ConfigError);
      expect(thrown.message).toContain('l10n.config.json: invalid configuration');
      expect(thrown.message).toContain(row.names);
    });
  }
});

describe('the model and the translation settings', () => {
  const thinkingRows = [
    { scenario: 'Claude Opus 5.5: thinking omitted, effort low', model: { id: 'claude-opus-5-5', effort: 'low' } },
    { scenario: 'Claude Sonnet 5.5: between_tools', model: { id: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } } },
    { scenario: 'Claude Haiku 5.5: disabled', model: { id: 'claude-haiku-5-5', thinking: { type: 'disabled' } } },
    { scenario: 'adaptive with a display', model: { id: 'claude-opus-5-5', thinking: { type: 'adaptive', display: 'omitted' }, fallbackId: 'claude-opus-4-8' } },
    { scenario: 'a bare id', model: 'claude-opus-5-5' },
  ];
  for (const row of thinkingRows) {
    it(`accepts ${row.scenario}, and resolves it unchanged`, () => {
      const cfg = parseConfig(variant((c) => (c.backend.model = row.model)));
      expect(cfg.backend.model).toEqual(row.model);
      expect(translationSettings(cfg.backend).model).toEqual(typeof row.model === 'string' ? { id: row.model } : row.model);
    });
  }

  it('applies every default in one place, leaving the parsed configuration as stated', () => {
    const cfg = parseConfig(fixtureConfig());
    expect(cfg.backend).toEqual({ kind: 'anthropic', apiKeyEnv: DEFAULT_API_KEY_ENV });
    expect(translationSettings(cfg.backend)).toEqual({
      model: { id: DEFAULT_MODEL },
      apiKeyEnv: DEFAULT_API_KEY_ENV,
      attempts: TRANSLATION_DEFAULTS.attempts,
      sectionTokens: TRANSLATION_DEFAULTS.sectionTokens,
      submission: { ...TRANSLATION_DEFAULTS.submission },
    });
  });

  it('lets the glossary’s model replace the id and nothing else', () => {
    const settings = translationSettings({ kind: 'anthropic', model: { id: 'claude-opus-5-5', effort: 'low' } }, { model: 'claude-sonnet-5-5' });
    expect(settings.model).toEqual({ id: 'claude-sonnet-5-5', effort: 'low' });
  });

  it('resolves promptsDir against the root, and defaults it to the memory directory’s prompts/', () => {
    writeJson(path.join(dir, 'locales.json'), { source: 'it', targets: ['en'] });
    writeJson(path.join(dir, 'l10n.config.json'), fixtureConfig());
    expect(loadConfig({ configPath: path.join(dir, 'l10n.config.json') }).promptsDir).toBe(path.join(dir, 'memory', 'prompts'));
    writeJson(path.join(dir, 'l10n.config.json'), variant((c) => (c.promptsDir = 'i18n/prompts')));
    expect(loadConfig({ configPath: path.join(dir, 'l10n.config.json') }).promptsDir).toBe(path.join(dir, 'i18n', 'prompts'));
  });
});

describe('the VITE_ refusal on the API key variable', () => {
  for (const name of ['VITE_ANTHROPIC_API_KEY', 'vite_key', 'Vite_Translate']) {
    it(`refuses ${name}, naming the rule`, () => {
      let thrown;
      try {
        parseConfig(variant((c) => (c.backend.apiKeyEnv = name)));
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ConfigError);
      expect(thrown.message).toContain(`backend.apiKeyEnv: "${name}" begins with VITE_`);
      expect(thrown.message).toContain("a secret's variable name never carries the VITE_ prefix");
    });
  }

  it('accepts a name that merely contains VITE', () => {
    expect(parseConfig(variant((c) => (c.backend.apiKeyEnv = 'SITE_VITE_KEY'))).backend.apiKeyEnv).toBe('SITE_VITE_KEY');
  });

  it('refuses a VITE_ name for the sync token variable too, naming the rule', () => {
    let thrown;
    try {
      parseConfig(variant((c) => ((c.ci = { branch: 'l10n-memory' }), (c.sync = { tokenEnv: 'VITE_L10N_GIT_READ_TOKEN' }))));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ConfigError);
    expect(thrown.message).toContain('sync.tokenEnv: "VITE_L10N_GIT_READ_TOKEN" begins with VITE_');
    expect(thrown.message).toContain("a secret's variable name never carries the VITE_ prefix");
  });
});

describe('loadConfig — the locale set is read, never copied', () => {
  it('reads source and targets from the file the configuration names', () => {
    writeJson(path.join(dir, 'locales.json'), { source: 'it', targets: ['en', 'de'], note: 'extra keys are the file owner’s' });
    writeJson(path.join(dir, 'l10n.config.json'), fixtureConfig());
    const project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
    expect(project.locales).toEqual({ source: 'it', targets: ['en', 'de'] });
  });

  it('accepts an inline locale set for a project with no declaration file', () => {
    writeJson(path.join(dir, 'l10n.config.json'), variant((c) => (c.locales = { source: 'en', targets: ['it'] })));
    expect(loadConfig({ configPath: path.join(dir, 'l10n.config.json') }).locales).toEqual({ source: 'en', targets: ['it'] });
  });

  it('names the declaration file when it is malformed', () => {
    writeJson(path.join(dir, 'locales.json'), { source: 'it' });
    writeJson(path.join(dir, 'l10n.config.json'), fixtureConfig());
    expect(() => loadConfig({ configPath: path.join(dir, 'l10n.config.json') })).toThrow(
      /locales\.json: malformed locale declaration/
    );
  });

  it('resolves every path against the configuration file’s directory', () => {
    writeJson(path.join(dir, 'locales.json'), { source: 'it', targets: ['en'] });
    writeJson(path.join(dir, 'l10n.config.json'), fixtureConfig());
    const project = loadConfig({ configPath: path.join(dir, 'l10n.config.json') });
    expect(project.root).toBe(dir);
    expect(project.memoryDir).toBe(path.join(dir, 'memory'));
    expect(project.glossaryPath).toBe(path.join(dir, 'glossary.json'));
  });

  it('refuses a file that is not JSON, naming it', () => {
    fs.writeFileSync(path.join(dir, 'l10n.config.json'), '{ not json', 'utf8');
    expect(() => loadConfig({ configPath: path.join(dir, 'l10n.config.json') })).toThrow(
      /l10n\.config\.json: the configuration is not valid JSON/
    );
  });
});

describe('findConfigPath — discovery order', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
    writeJson(path.join(dir, 'l10n.config.json'), {});
    writeJson(path.join(dir, 'other.json'), {});
  });

  it('walks up from the working directory to the nearest l10n.config.json', () => {
    expect(findConfigPath({ cwd: path.join(dir, 'a', 'b'), env: {} })).toBe(path.join(dir, 'l10n.config.json'));
  });

  it('prefers L10N_CONFIG over the search', () => {
    expect(findConfigPath({ cwd: path.join(dir, 'a'), env: { L10N_CONFIG: '../other.json' } })).toBe(
      path.join(dir, 'other.json')
    );
  });

  it('prefers an explicit path over L10N_CONFIG', () => {
    expect(
      findConfigPath({ cwd: dir, env: { L10N_CONFIG: 'nope.json' }, explicit: 'other.json' })
    ).toBe(path.join(dir, 'other.json'));
  });

  it('says how to point at a file when none is found', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-none-'));
    try {
      expect(() => findConfigPath({ cwd: empty, env: {} })).toThrow(/no l10n\.config\.json found.*--config/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('expandLang', () => {
  it('replaces every placeholder', () => {
    expect(expandLang('content/{lang}/x-{lang}.json', 'en')).toBe('content/en/x-en.json');
  });
});
