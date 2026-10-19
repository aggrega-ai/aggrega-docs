/**
 * anthropic.mjs — The synchronous translation backend: one Messages API call per
 * request, through the official SDK.
 *
 * This is the object INJECTED into the engine (`createEngine({backend})`); the
 * command line builds it from the configuration through `createConfiguredBackend`
 * (backends/index.mjs). For each request the engine plans, it calls
 * `backend.translate({ request, items, lang, sourceLang, glossary })` and
 * receives the reply as `{ entries, model }`, `{ refusal, model }` or
 * `{ defect, model }`. Validating the entries and writing the memory are the
 * engine's.
 *
 * READS the API key, through the one client factory (`client.mjs`), from the
 * variable the configuration names; the per-language prompts and the project
 * general prompt it is handed; and the glossary the engine hands it. WRITES
 * nothing.
 *
 * The request is the ONE builder's (`requests.mjs`): the batch transport sends
 * the very same `system` and `messages` for the same page. The reply is read by
 * the one reader (`readTranslationMessage`). The client is created on the first
 * call, so a run with nothing to translate never needs the key; it is created
 * with the SDK's own retries off, because the engine already retries transient
 * errors with backoff.
 *
 * SECURITY: a variable name beginning `VITE_` is refused when the backend is
 * created, before any request can exist, because Vite would inline such a
 * variable into the client bundle. With the key absent, the first call throws a
 * NON-transient error naming the variable, so a CI build fails loudly and makes
 * no network call.
 */

import { DEFAULT_MODEL, assertServerOnlyEnvName, translationSettings } from '../config.mjs';
import { classifyClientError, createAnthropicClient } from '../client.mjs';
import { buildMessageParams, buildSystem } from '../requests.mjs';
import { readTranslationMessage } from '../translator-prompt.mjs';

export { DEFAULT_MODEL };

/**
 * Creates a backend instance.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.backendConfig]  the validated `backend` key (model, apiKeyEnv, …).
 * @param {Object.<string,string>} [opts.prompts]  locale → the per-language prompt text.
 * @param {string|null} [opts.generalPrompt]  the project general prompt's text, or null without one.
 * @param {NodeJS.ProcessEnv} [opts.env] the environment the key is read from (default `process.env`).
 * @param {Object} [opts.client]         an SDK client to use instead of creating one (a test seam).
 * @param {Function} [opts.ClientClass]  the SDK client class the factory constructs (a test seam).
 * @returns {{translate: Function}}
 */
export function createBackend({ backendConfig = {}, prompts = {}, generalPrompt = null, env, client, ClientClass } = {}) {
  const base = translationSettings(backendConfig);
  assertServerOnlyEnvName(base.apiKeyEnv, 'backend.apiKeyEnv');
  let sdk = client || null;
  const getClient = () => {
    if (!sdk) {
      sdk = createAnthropicClient({
        apiKeyEnv: base.apiKeyEnv,
        env: env || process.env,
        maxRetries: 0,
        ...(ClientClass ? { ClientClass } : {}),
      });
    }
    return sdk;
  };

  /**
   * translate — sends one request and reads its reply.
   *
   * @param {Object} args
   * @param {import('../types.mjs').RequestSpec} args.request  the planned request.
   * @param {string} args.lang
   * @param {string} args.sourceLang
   * @param {Object} [args.glossary]
   */
  async function translate({ request, lang, sourceLang, glossary = {} }) {
    const settings = translationSettings(backendConfig, glossary);
    const sdkClient = getClient();
    const system = buildSystem({ lang, sourceLang, glossary, generalPrompt, languagePrompt: prompts[lang] });
    const params = buildMessageParams(request, { model: settings.model, system });
    let message;
    try {
      message = await sdkClient.messages.create(params);
    } catch (err) {
      throw classifyClientError(err);
    }
    return { ...readTranslationMessage(message), model: params.model };
  }

  return { translate };
}

export default { createBackend, DEFAULT_MODEL };
