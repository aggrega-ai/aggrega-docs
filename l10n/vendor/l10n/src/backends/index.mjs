/**
 * backends/index.mjs — Selection and construction of the translation backend.
 *
 * READS the `I18N_BACKEND` environment variable (when set) and the
 * configuration's `backend` key. WRITES nothing, and makes no network call and
 * starts no process: constructing a backend only prepares it.
 *
 * Two backends are supported:
 *   - `anthropic`: the Anthropic Messages API through the official SDK, in
 *     `anthropic.mjs`, used synchronously by `translate` and `pipeline`; the
 *     Message Batches API that `submit`, `collect`, `ci` and `local` use is the
 *     same backend's other transport (`batch.mjs`), with the same request
 *     builder and the same client factory;
 *   - `claude-code`: Claude Code run headless, one process per request, on a
 *     Claude subscription, in `claude-code.mjs`, used by `translate`,
 *     `pipeline` and `local`. It has no batch transport, so `submit`, `collect`
 *     and `ci` refuse it.
 * The configuration's `backend.kind` names one; `I18N_BACKEND`, when set, names
 * the backend of that run instead, built from the configuration's shared keys
 * (`model`, `attempts`, `sectionTokens`) when the configured kind is the other
 * one. Any other value — a retired backend's name included — is refused with
 * the supported set named, so a stale environment cannot silently fall back to
 * a default.
 */

import { BACKEND_KINDS, translationSettings } from '../config.mjs';
import { createBackend } from './anthropic.mjs';
import { claudeCodeCredential, claudeCodeSettings, createClaudeCodeBackend } from './claude-code.mjs';

/** The backends this package can construct, by name. */
export const SUPPORTED_BACKENDS = BACKEND_KINDS;

/** The backends with a batch transport: `submit`, `collect` and `ci` run on these alone. */
export const BATCH_BACKENDS = Object.freeze(['anthropic']);

/** A backend selection that names no supported backend. */
export class BackendSelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackendSelectionError';
  }
}

/**
 * The backend kind to use: `I18N_BACKEND` when set, else the configured kind.
 * Throws a BackendSelectionError naming the supported set when the chosen name
 * is not one of them.
 *
 * @param {Object} args
 * @param {string} [args.configured]          the configuration's `backend.kind`.
 * @param {NodeJS.ProcessEnv} [args.env]      the environment (default `process.env`).
 * @returns {string}
 */
export function selectBackendKind({ configured, env = process.env } = {}) {
  const fromEnv = env.I18N_BACKEND;
  const kind = fromEnv !== undefined && fromEnv !== '' ? fromEnv : configured;
  if (!SUPPORTED_BACKENDS.includes(kind)) {
    const source = fromEnv !== undefined && fromEnv !== '' ? 'I18N_BACKEND' : 'backend.kind';
    throw new BackendSelectionError(
      `${source}="${kind}" is not a supported translation backend; supported: ${SUPPORTED_BACKENDS.join(', ')}.`
    );
  }
  return kind;
}

/**
 * Builds the backend the configuration describes.
 *
 * @param {Object} args
 * @param {Object} args.backendConfig       the validated `backend` key.
 * @param {Object.<string,string>} [args.prompts]  locale → the per-language prompt text.
 * @param {string|null} [args.generalPrompt]  the project general prompt's text, or null without one.
 * @param {NodeJS.ProcessEnv} [args.env]    the environment the key is read from, at call time.
 * @param {Object} [args.options]           extra options for the backend (client, ClientClass).
 */
export function createConfiguredBackend({ backendConfig, prompts = {}, generalPrompt = null, env = process.env, options = {} }) {
  const kind = selectBackendKind({ configured: backendConfig.kind, env });
  const config = configFor(kind, backendConfig);
  if (kind === 'anthropic') {
    return createBackend({ backendConfig: config, prompts, generalPrompt, env, ...options });
  }
  if (kind === 'claude-code') {
    return createClaudeCodeBackend({ backendConfig: config, prompts, generalPrompt, env, ...(options.run ? { run: options.run } : {}) });
  }
  throw new BackendSelectionError(`no constructor for backend "${kind}"`);
}

/** The `backend` key a backend of `kind` is built from: the configured one, or its shared keys when it names the other kind. */
export function configFor(kind, backendConfig = {}) {
  if (backendConfig.kind === kind) return backendConfig;
  const shared = {};
  for (const key of ['model', 'attempts', 'sectionTokens']) if (backendConfig[key] !== undefined) shared[key] = backendConfig[key];
  return { kind, ...shared };
}

/**
 * The credential a run of `kind` translates with, read from the environment
 * and never returned: whether it is present, the variable it is read from, and
 * a sentence naming it.
 *
 * @param {Object} args
 * @param {string} args.kind
 * @param {Object} args.backendConfig  the validated `backend` key.
 * @param {NodeJS.ProcessEnv} args.env
 * @returns {{present:boolean, name:string, describe:string}}
 */
export function credentialOf({ kind, backendConfig, env }) {
  const config = configFor(kind, backendConfig);
  if (kind === 'claude-code') {
    const settings = claudeCodeSettings(config);
    const credential = claudeCodeCredential({ settings, env });
    return {
      present: !credential.missing,
      name: settings.tokenEnv,
      describe: credential.login ? 'the Claude Code CLI login' : `the Claude Code token in ${settings.tokenEnv}`,
    };
  }
  const { apiKeyEnv } = translationSettings(config);
  const value = env[apiKeyEnv];
  return { present: typeof value === 'string' && value.trim() !== '', name: apiKeyEnv, describe: `the API key in ${apiKeyEnv}` };
}

export default { SUPPORTED_BACKENDS, BATCH_BACKENDS, selectBackendKind, createConfiguredBackend, configFor, credentialOf };
