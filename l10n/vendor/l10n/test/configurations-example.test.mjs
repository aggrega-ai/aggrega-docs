/**
 * configurations-example.test.mjs — The configurations under
 * `examples/configurations/` validate against the schema and resolve to the
 * settings their README describes, so a copy of either starts from a valid file.
 *
 * READS the two configuration files; WRITES nothing.
 */

import './no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { jsonContentSettings, parseConfig } from '../src/config.mjs';
import { claudeCodeSettings } from '../src/backends/claude-code.mjs';
import { EXAMPLES } from './helpers.mjs';

const read = (name) => JSON.parse(fs.readFileSync(path.join(EXAMPLES, 'configurations', name), 'utf8'));

describe('examples/configurations', () => {
  it('hand-written-targets: paired pages under their target names, the site’s shape, a safe materialize', () => {
    const config = parseConfig(read('hand-written-targets.l10n.config.json'));
    expect(jsonContentSettings(config.adapter).output).toEqual({
      path: 'prefixed',
      langField: false,
      keyOrder: 'source',
      pairs: 'langMap',
      fileName: 'path',
      materialize: 'safe',
    });
  });

  it('whole-documents: pages and documents, neutral paths, the value rules, a nested dictionary, seven locales, the local mode on Claude Code', () => {
    const config = parseConfig(read('whole-documents.l10n.config.json'));
    const settings = jsonContentSettings(config.adapter);
    expect(settings.document).toEqual({ walk: 'auto', contextKey: 'tipo' });
    expect(settings.output).toMatchObject({ path: 'neutral', langField: false, keyOrder: 'source', pairs: 'all' });
    expect(settings.ui.nested).toBe(true);
    expect(config.locales.targets).toEqual(['en', 'fr', 'de', 'es', 'pt', 'zh-Hans', 'zh-Hant']);
    expect(config.mode).toBe('local');
    expect(claudeCodeSettings(config.backend)).toMatchObject({ login: 'allowed', tokenEnv: 'CLAUDE_CODE_OAUTH_TOKEN' });
  });
});
