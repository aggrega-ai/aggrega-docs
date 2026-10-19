/**
 * pipeline.mjs — Orchestration of the translation pipeline for CI and build time.
 *
 * Run as `l10n pipeline`. It chains the engine's stages with the configured
 * adapter and backend:
 *
 *   extract → gate → (decision) → translate → generate
 *
 * THE DECISION (pure, see `decidePipeline`):
 *   - gate `up-to-date`               → NO-OP: no translation, NO network,
 *                                       exit 0. The "nothing to do" case.
 *   - work remains AND the key is set → translate → (if translate fails, exit ≠ 0
 *                                       so the CI build fails) → generate → exit 0.
 *   - work remains AND NO key         → a clear message plus exit ≠ 0: CI MUST
 *                                       supply the API key secret. No network
 *                                       call is attempted.
 *
 * The API key is read ONLY from the environment variable the configuration names
 * (`backend.apiKeyEnv`, default `ANTHROPIC_API_KEY`) — never committed, never
 * carrying a `VITE_` prefix, which would inline it into the client bundle. Here
 * only its PRESENCE is inspected, to pick the branch; the call itself is the
 * backend's, whose SDK client the one client factory (`client.mjs`) creates with
 * that value and no other credential.
 *
 * READS the memory directory through the engine's store and the source-locale
 * content through the adapter's extract. WRITES the catalogue, the machine layer
 * of the memory, the job log and the regenerated STAGING targets — and nothing
 * else. It performs no commit: committing what it produced is a step of the CI
 * job that runs it. Promoting staging to the real targets is `l10n materialize`,
 * and the drift guard (`l10n verify-drift`) is a dedicated check run once the
 * targets are canonical.
 *
 * Runs at build and CI time only, under Node. It is never imported into the
 * runtime that is served.
 */

import { createEngine } from './engine.mjs';
import { hasWork, humanLine } from './gate.mjs';
import { DEFAULT_API_KEY_ENV } from './config.mjs';

/** The pipeline's possible actions (both decisions and outcomes). */
export const ACTION = {
  NOOP: 'noop', // the gate is up-to-date: nothing to do
  MISSING_KEY: 'missing-key', // work remains but the key is absent
  TRANSLATE: 'translate', // work remains and the key is set (a pre-execution decision)
  TRANSLATED: 'translated', // translate succeeded and generate ran (an outcome)
  TRANSLATE_FAILED: 'translate-failed', // translate failed (an outcome, exit ≠ 0)
};

/**
 * The pipeline's PURE decision: given the gate's outcome and whether the key is
 * present, which branch to run. No I/O and no network, so it is testable in
 * isolation.
 *
 * @param {Object} args
 * @param {import('./types.mjs').Worklist} args.worklist  the gate's outcome.
 * @param {boolean} args.hasKey                           is the API key present?
 * @returns {{action:string, code:number, network:boolean, reason:string}}
 */
export function decidePipeline({ worklist, hasKey }) {
  if (!hasWork(worklist)) {
    return { action: ACTION.NOOP, code: 0, network: false, reason: 'up-to-date' };
  }
  if (!hasKey) {
    return { action: ACTION.MISSING_KEY, code: 1, network: false, reason: 'work-remains-no-key' };
  }
  return { action: ACTION.TRANSLATE, code: 0, network: true, reason: 'work-remains-with-key' };
}

/**
 * Runs the pipeline. The adapter and backend are INJECTED (the command line
 * builds them from the configuration; the tests pass fakes). It always returns
 * `{ action, code, ... }` rather than exiting the process, which is what makes
 * it testable; the command line maps `code` onto the exit status.
 *
 * @param {Object} args
 * @param {string} args.baseDir          the memory directory.
 * @param {string[]} args.targets        target languages.
 * @param {Object|null} args.adapter     the content adapter.
 * @param {Object|null} args.backend     the translation backend.
 * @param {boolean} args.hasKey          is the API key present?
 * @param {string} [args.apiKeyEnv]      the key's variable name, for the messages.
 * @param {Object} [args.glossary]       the glossary handed to the backend.
 * @param {Object} [args.engineOptions]  options passed through to the engine.
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {Promise<{action:string, code:number, worklist?:Object, result?:string}>}
 */
export async function runPipeline({
  baseDir,
  targets,
  adapter = null,
  backend = null,
  hasKey,
  apiKeyEnv = DEFAULT_API_KEY_ENV,
  glossary = {},
  engineOptions = {},
  log = (...a) => console.log(...a),
  errlog = (...a) => console.error(...a),
}) {
  const engine = createEngine({ adapter, backend, paths: { baseDir }, options: engineOptions });

  // Stage 1 — extract (adapter): the source catalog, out of the source locale.
  if (!adapter || typeof adapter.extract !== 'function') {
    errlog('[pipeline] no adapter configured: cannot extract the source catalog.');
    return { action: ACTION.TRANSLATE_FAILED, code: 2 };
  }
  const { unitCount } = await engine.extract();
  log(`[pipeline] extract: ${unitCount} source units.`);

  // Stage 2 — gate (engine): the set difference of catalog × languages against
  // the memory. Zero tokens.
  const worklist = engine.gate({ targets });
  log(`[pipeline] gate: ${humanLine(worklist)}`);

  const decision = decidePipeline({ worklist, hasKey });

  if (decision.action === ACTION.NOOP) {
    log('[pipeline] no translation needed: no network call, no commit. No-op.');
    return { action: ACTION.NOOP, code: 0, worklist };
  }

  if (decision.action === ACTION.MISSING_KEY) {
    errlog(`[pipeline] strings remain to be translated but ${apiKeyEnv} is not set.`);
    errlog(`[pipeline] CI must supply the ${apiKeyEnv} secret (never committed, never with a VITE_ prefix).`);
    errlog('[pipeline] No network call was made. Exiting non-zero, so the build fails.');
    return { action: ACTION.MISSING_KEY, code: 1, worklist };
  }

  // decision.action === TRANSLATE — work remains and the key is present.
  if (!backend || typeof backend.translate !== 'function') {
    errlog('[pipeline] no translation backend configured: cannot translate.');
    return { action: ACTION.TRANSLATE_FAILED, code: 2, worklist };
  }

  // Stage 3 — translate (engine plus backend). A hard failure exits non-zero.
  log('[pipeline] translate: calling the translation backend...');
  const { result, jobFile, job } = await engine.translate({ targets, glossary, trigger: 'push' });
  const translated = job ? job.items.length : 0;
  const failed = job ? job.failures.length : 0;
  log(
    `[pipeline] translate: result=${result}, translated=${translated}, failed=${failed}` +
      (jobFile ? `, job=${jobFile}` : '')
  );
  if (result !== 'ok') {
    errlog('[pipeline] translation did NOT complete: the build must fail. The targets were not generated.');
    return { action: ACTION.TRANSLATE_FAILED, code: 1, worklist, result };
  }

  // Stage 4 — generate (adapter): regenerates the derived targets into staging.
  log('[pipeline] generate: regenerating the target artifacts...');
  await engine.generate({ targets });
  log('[pipeline] generate: targets regenerated. Memory, job log and targets are ready to be committed.');

  return { action: ACTION.TRANSLATED, code: 0, worklist, result };
}

export default { decidePipeline, runPipeline, ACTION };
