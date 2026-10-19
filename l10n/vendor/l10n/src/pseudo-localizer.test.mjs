import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPseudoLocalizer, pseudoLocalize } from './pseudo-localizer.mjs';
import { SUPPORTED_BACKENDS, BackendSelectionError, selectBackendKind, createConfiguredBackend } from './backends/index.mjs';
import { parseConfig, ConfigError } from './config.mjs';
import { fixtureConfig } from '../test/helpers.mjs';

describe('pseudoLocalize', () => {
  it('turns every ASCII letter into an accented letter and keeps every other character', () => {
    expect(pseudoLocalize('Hello, World 42!')).toBe('Ĥéĺĺó, Ŵóŕĺď 42!');
  });

  it('maps each ASCII letter to a single precomposed letter', () => {
    const all = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const out = pseudoLocalize(all);
    expect(out).toHaveLength(all.length);
    expect(out).toMatch(/^\p{L}+$/u);
    expect(out.normalize('NFC')).toBe(out);
    expect(/[A-Za-z]/.test(out)).toBe(false);
  });

  it('copies protected spans byte for byte', () => {
    const source = 'Run `npm test` then [read](https://x.example).';
    const spans = [
      [4, 14],
      [25, source.length - 1],
    ];
    const out = pseudoLocalize(source, spans);
    expect(out.slice(4, 14)).toBe('`npm test`');
    expect(out.endsWith('](https://x.example).')).toBe(true);
    expect(out.startsWith('Ŕúñ ')).toBe(true);
  });

  it('is deterministic', async () => {
    const items = [{ srcHash: 'k', source: 'Same text', protected: [[0, 4]] }];
    const a = await createPseudoLocalizer().translate({ items, lang: 'it' });
    const b = await createPseudoLocalizer().translate({ items, lang: 'de' });
    expect(a).toEqual({ translations: { k: 'Same ţéẋţ' }, model: 'pseudo' });
    expect(b).toEqual(a);
  });
});

describe('the pseudo-localizer is not a configurable backend', () => {
  it('is not in the supported set', () => {
    expect(SUPPORTED_BACKENDS).toEqual(['anthropic', 'claude-code']);
  });

  it('cannot be named by I18N_BACKEND or by backend.kind', () => {
    expect(() => selectBackendKind({ configured: 'anthropic', env: { I18N_BACKEND: 'pseudo' } })).toThrow(BackendSelectionError);
    expect(() => selectBackendKind({ configured: 'pseudo', env: {} })).toThrow(BackendSelectionError);
    expect(() => createConfiguredBackend({ backendConfig: { kind: 'pseudo', apiKeyEnv: 'K' }, env: {} })).toThrow(
      BackendSelectionError
    );
    const cfg = fixtureConfig();
    cfg.backend.kind = 'pseudo';
    expect(() => parseConfig(cfg)).toThrow(ConfigError);
  });

  it('does not live with the backends', () => {
    const backends = fileURLToPath(new URL('./backends/', import.meta.url));
    for (const file of fs.readdirSync(backends)) {
      expect(fs.readFileSync(path.join(backends, file), 'utf8'), file).not.toMatch(/pseudo/i);
    }
  });
});
