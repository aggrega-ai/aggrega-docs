import { NetworkAttemptError, networkAttempts, unguardedFetch } from '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAnthropicClient } from './client.mjs';

const PACKAGE = fileURLToPath(new URL('../', import.meta.url));

/** Every test file of the package, outside installed dependencies. */
function packageTestFiles() {
  return fs
    .readdirSync(PACKAGE, { recursive: true })
    .filter((rel) => rel.endsWith('.test.mjs') && !rel.split(path.sep).includes('node_modules'))
    .map((rel) => path.join(PACKAGE, rel))
    .sort();
}

describe('no test makes a network call', () => {
  it('every test file of the package imports the network guard before anything else', () => {
    const files = packageTestFiles();
    // The needle: this file is in the census, so the census reaches the test tree.
    expect(files).toContain(fileURLToPath(import.meta.url));
    const unguarded = files.filter((file) => {
      const firstImport = fs.readFileSync(file, 'utf8').match(/^import [^\n]*$/m);
      return !firstImport || !/no-network\.mjs['"];?$/.test(firstImport[0]);
    });
    expect(unguarded.map((f) => path.relative(PACKAGE, f))).toEqual([]);
  });

  it('a real SDK client built by the factory fails on the guard’s fetch layer', async () => {
    const before = networkAttempts().length;
    const client = createAnthropicClient({ apiKeyEnv: 'SITE_KEY', env: { SITE_KEY: 'not-a-key' }, maxRetries: 0 });
    let thrown;
    try {
      await client.messages.create({ model: 'claude-opus-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'x' }] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    const attempts = networkAttempts().slice(before);
    expect(attempts).toEqual([{ layer: 'fetch', target: 'https://api.anthropic.com/v1/messages' }]);
  });

  it('the connect layer refuses on its own: Node’s fetch and a raw socket both stop there', async () => {
    // A local port off the fetch standard's blocked list (which holds 9), so the
    // request reaches the connect step; nothing listens there either way.
    const before = networkAttempts().length;
    const failure = await unguardedFetch()('http://127.0.0.1:59999/').catch((err) => err);
    expect(failure.cause).toBeInstanceOf(NetworkAttemptError);
    expect(() => net.connect({ host: '127.0.0.1', port: 59999 })).toThrow(NetworkAttemptError);
    expect(networkAttempts().slice(before)).toEqual([
      { layer: 'connect', target: '127.0.0.1:59999' },
      { layer: 'connect', target: '127.0.0.1:59999' },
    ]);
  });
});
