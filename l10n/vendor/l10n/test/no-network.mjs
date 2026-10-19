/**
 * no-network.mjs — The network guard of the package's tests.
 *
 * READS nothing and WRITES nothing. Every test file of the package imports this
 * module first; it replaces the global `fetch` and `net.Socket.prototype.connect`
 * with functions that record the attempt and throw a NetworkAttemptError. The
 * SDK client takes the global `fetch` when it is constructed, and Node's own
 * `fetch` connects through `net.Socket.prototype.connect`, so a test that
 * reached for the network through either fails loudly instead of calling an API.
 * The two layers are independent: each still refuses with the other removed.
 *
 * Installed once per process, whichever test file imports it first; the attempts
 * are kept on a global so every file sees the same record.
 */

import net from 'node:net';

const STATE = Symbol.for('@aggrega-ai/l10n/test/no-network');

/** A test attempted network access. */
export class NetworkAttemptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkAttemptError';
  }
}

if (!globalThis[STATE]) {
  const state = { attempts: [], fetch: globalThis.fetch, connect: net.Socket.prototype.connect };
  globalThis[STATE] = state;
  const refuse = (layer, target) => {
    state.attempts.push({ layer, target });
    throw new NetworkAttemptError(`a test attempted network access (${layer} ${target}); tests inject a fake client`);
  };
  globalThis.fetch = async function guardedFetch(input) {
    return refuse('fetch', String((input && input.url) || input));
  };
  net.Socket.prototype.connect = function guardedConnect(...args) {
    // `net.connect` passes its normalised arguments as one array, options first.
    const [first, second] = Array.isArray(args[0]) ? args[0] : args;
    const target = first && typeof first === 'object' ? `${first.host || first.path || ''}:${first.port || ''}` : `${second || ''}:${first}`;
    return refuse('connect', target);
  };
}

/** The network attempts the guard refused in this process, in order. */
export function networkAttempts() {
  return [...globalThis[STATE].attempts];
}

/** The `fetch` the guard replaced, so a test can show the connect layer refuses it on its own. */
export function unguardedFetch() {
  return globalThis[STATE].fetch;
}
