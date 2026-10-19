/**
 * client.mjs — The one constructor of an Anthropic SDK client, for both
 * transports.
 *
 * READS the API key from the one environment variable the configuration names
 * (`backend.apiKeyEnv`, default `ANTHROPIC_API_KEY`), from the environment it is
 * handed. WRITES nothing, and constructing a client makes no network call.
 *
 * ONLY THAT VALUE IS EVER A CREDENTIAL. Constructed without options, the SDK
 * client would find credentials on its own: `ANTHROPIC_API_KEY`, then
 * `ANTHROPIC_AUTH_TOKEN`, then an OAuth or named profile, workload-identity
 * variables and configuration files, and it would take a base URL from
 * `ANTHROPIC_BASE_URL` and extra headers — an `Authorization` or `X-Api-Key`
 * among them — from `ANTHROPIC_CUSTOM_HEADERS`. The client built here closes
 * each of those:
 *   - `apiKey` is the configured variable's value and `authToken` is null, so
 *     the SDK reads neither `ANTHROPIC_API_KEY` nor `ANTHROPIC_AUTH_TOKEN`, and
 *     with a key present it never runs its credential chain; `credentials`,
 *     `config` and `profile` are null besides;
 *   - `defaultHeaders` sets `X-Api-Key` to the same value and removes
 *     `Authorization`, and the SDK applies these after any header
 *     `ANTHROPIC_CUSTOM_HEADERS` supplies;
 *   - `baseURL` is the Anthropic API's host, so the environment cannot send the
 *     key anywhere else;
 *   - `webhookKey` is null, so the webhook signing key is not read either.
 * A name beginning `VITE_` is refused, and a missing value stops the caller,
 * before any client exists. The key never appears in a message this module
 * produces; the SDK's own debug logging masks both authentication headers.
 *
 * Runs at build and CI time only, under Node.
 */

import Anthropic, { APIConnectionError } from '@anthropic-ai/sdk';

import { DEFAULT_API_KEY_ENV, assertServerOnlyEnvName } from './config.mjs';

/** The one host the configured key is ever sent to. */
export const ANTHROPIC_API_HOST = 'https://api.anthropic.com';

/** The configured API-key variable is unset or empty. Not transient: a run without a key must fail. */
export class MissingApiKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingApiKeyError';
    this.transient = false;
  }
}

/**
 * Reads the API key from the variable the configuration names. Refuses a
 * `VITE_` name first, and throws a MissingApiKeyError naming the variable when
 * it holds no value.
 *
 * @param {Object} [args]
 * @param {string} [args.apiKeyEnv]       the variable name (default `ANTHROPIC_API_KEY`).
 * @param {NodeJS.ProcessEnv} [args.env]  the environment (default `process.env`).
 * @returns {string}
 */
export function readApiKey({ apiKeyEnv = DEFAULT_API_KEY_ENV, env = process.env } = {}) {
  assertServerOnlyEnvName(apiKeyEnv, 'backend.apiKeyEnv');
  const value = env[apiKeyEnv];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MissingApiKeyError(
      `${apiKeyEnv} is not set: the translation API cannot be called. ` +
        'Supply it as an environment secret in CI (never committed, never with a VITE_ prefix).'
    );
  }
  return value.trim();
}

/**
 * Creates the SDK client, holding only the configured key.
 *
 * @param {Object} [args]
 * @param {string} [args.apiKeyEnv]
 * @param {NodeJS.ProcessEnv} [args.env]
 * @param {number} [args.maxRetries]   the SDK's own retries (default 2, the SDK's default).
 * @param {typeof Anthropic} [args.ClientClass]  the client class (a test seam).
 * @param {typeof fetch} [args.fetch]  the fetch the client uses (a test seam).
 * @returns {Anthropic}
 */
export function createAnthropicClient({ apiKeyEnv, env, maxRetries = 2, ClientClass = Anthropic, fetch } = {}) {
  const apiKey = readApiKey({ apiKeyEnv, env });
  return new ClientClass({
    apiKey,
    authToken: null,
    credentials: null,
    config: null,
    profile: null,
    webhookKey: null,
    baseURL: ANTHROPIC_API_HOST,
    defaultHeaders: { 'X-Api-Key': apiKey, Authorization: null },
    maxRetries,
    ...(fetch ? { fetch } : {}),
  });
}

/**
 * Marks an SDK connection failure as transient, so the engine's retry treats it
 * as it treats a timeout; any other error is returned as it is.
 *
 * @param {*} err
 * @returns {*}
 */
export function classifyClientError(err) {
  if (err instanceof APIConnectionError && err.transient === undefined) err.transient = true;
  return err;
}

export default { createAnthropicClient, readApiKey, classifyClientError, MissingApiKeyError, ANTHROPIC_API_HOST };
