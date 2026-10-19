/**
 * batch.mjs — The Message Batches transport: `submit`, `collect`, `status` and
 * `cancelBatch`.
 *
 * READS the catalogue, both memory layers and the pending file through the
 * store, the pages through the adapter, and — for `submit`, `collect` and
 * `cancelBatch` — the Message Batches API through the client the caller's
 * factory creates. WRITES, through the store, the pending file (`submit`,
 * `collect`), the MACHINE layer of the memory and a job log per collected batch
 * (`collect`). It never writes the human layer, and `status`, `submit --dry-run`
 * and `cancelBatch` write no file at all.
 *
 * SUBMIT runs the gate; with no work it stops there, creating no client. It
 * plans the page requests (`requests.mjs`), builds each with the one builder, and
 * takes them in their stable order while they fit the per-submission budgets:
 * the estimated input (`tokens.mjs`) and the sum of the requests' `max_tokens`,
 * a ceiling the API enforces per request. It stops at the first request that
 * does not fit and leaves it and the rest for the next submission. It creates
 * one batch and records it in the pending file with each request's mapping —
 * custom identifier to page, section, locale, segment identifiers, attempt and
 * model. When that file cannot be written after the batch was created, the
 * batch would be recorded nowhere and its units requested again by the next
 * submission, so `submit` cancels it (`cancelBatch`), prints its id and whether
 * the API accepted the cancellation, and returns 1. It refuses while a recorded
 * batch has not been collected, so one batch at a time is in flight.
 * `--dry-run` builds the same requests, prints per locale the page count and
 * the estimated input and output tokens, and creates no client and writes
 * nothing. Every estimate it and `submit` print splits the input into its
 * cached and uncached shares (`cachedEstimates`, over the selected requests in
 * their order); the budgets count the whole input, since a cache hit inside a
 * batch is best-effort.
 *
 * COLLECT retrieves each recorded batch. One still processing is left recorded.
 * One that has ended has its results read and keyed by custom identifier —
 * never by position, since results arrive in any order. Each succeeded reply is
 * read and validated (`validate.mjs`) and its accepted segments are written to
 * the machine layer; rejected, refused, errored, expired and canceled segments,
 * and those of a request with no result, are queued for resubmission with their
 * defect, a refusal on the fallback model when the configuration names one. An
 * identifier a reply returned that its request did not ask for is dropped: it is
 * named in the output and in the job log, and nothing is written or queued for
 * it. The batch is then cleared from the pending file. A machine entry carries the
 * batch's identifier and recorded creation time, and a queued segment's attempt
 * count is set from the recorded attempt, so applying the same results twice
 * writes the same bytes.
 *
 * STATUS prints the recorded batches and the queue, and makes no network call.
 *
 * CANCELBATCH asks the API to cancel one batch, by identifier, and reports the
 * outcome without printing or throwing. A canceled batch enters `canceling`;
 * the API may still complete requests in progress that cannot be interrupted,
 * and those, like any it had already processed, may be billed.
 */

import { computeWorklist } from './gate.mjs';
import { buildMessageParams, buildSystem, pagesFromCatalog, planRequests } from './requests.mjs';
import { cachedEstimates, estimateRequest } from './tokens.mjs';
import { validateTranslations } from './validate.mjs';
import { doNotTranslateOf, readTranslationMessage } from './translator-prompt.mjs';
import { clearQueued, customIdFor, queueDefect, refusalDefect } from './pending.mjs';
import { classifyClientError, MissingApiKeyError } from './client.mjs';
import { LAYER, RESULT, STATUS } from './types.mjs';

/** The most requests one batch holds, from the Message Batches API reference. */
export const MAX_BATCH_REQUESTS = 100000;

/**
 * Takes requests in order while they fit the budgets, stopping at the first that
 * does not.
 *
 * @param {Array<{estimate: {input:number, output:number}}>} requests  in their stable order.
 * @param {{inputTokens:number, outputTokens:number}} budget
 * @param {number} [maxRequests]
 * @returns {{selected: Array, deferred: Array, totals: {input:number, output:number}}}
 */
export function selectWithinBudget(requests, { inputTokens, outputTokens }, maxRequests = MAX_BATCH_REQUESTS) {
  const totals = { input: 0, output: 0 };
  let count = 0;
  for (const request of requests) {
    const input = totals.input + request.estimate.input;
    const output = totals.output + request.estimate.output;
    if (count >= maxRequests || input > inputTokens || output > outputTokens) break;
    totals.input = input;
    totals.output = output;
    count += 1;
  }
  return { selected: requests.slice(0, count), deferred: requests.slice(count), totals };
}

/** The cached and uncached shares of an input estimate, as printed after it. */
const inputSplit = (input, cached) => `(${cached} cached, ${input - cached} uncached)`;

/** One line per locale: the pages and the estimated tokens of the selected requests. */
function perLocaleLines(selected, targets) {
  const lines = [];
  for (const lang of targets) {
    const mine = selected.filter((r) => r.spec.lang === lang);
    if (mine.length === 0) continue;
    const pages = new Set(mine.map((r) => r.spec.page)).size;
    const input = mine.reduce((n, r) => n + r.estimate.input, 0);
    const cached = mine.reduce((n, r) => n + r.cached, 0);
    const output = mine.reduce((n, r) => n + r.estimate.output, 0);
    lines.push(`  ${lang}: ${pages} page${pages === 1 ? '' : 's'}, ${mine.length} request${mine.length === 1 ? '' : 's'}, estimated input ${input} tokens ${inputSplit(input, cached)}, estimated output ${output} tokens`);
  }
  return lines;
}

const describe = (spec) => `${spec.page}${spec.section !== null && spec.section !== undefined ? ` § ${spec.section}` : ''} (${spec.lang})`;

/**
 * Plans the requests a submission would make for a worklist and builds each
 * with the one builder, in their stable order, before any budget is applied:
 * the pages (the adapter's, else the catalogue's usage files), the plan
 * (`planRequests`), and per request its specification, its Messages API
 * parameters and its offline estimate (`estimateRequest`). `submit` takes from
 * these what fits its budgets; `prepush` sums them for its cost estimate. Reads
 * the pages through the adapter and nothing else; creates no client.
 *
 * @param {Object} args
 * @param {Object|null} args.adapter
 * @param {Object} args.catalog         the source catalogue.
 * @param {Object} args.worklist        the gate's worklist for `targets`.
 * @param {Object} args.tmByLang        the lookup view of the memory, per locale.
 * @param {string[]} args.targets
 * @param {import('./config.mjs').TranslationSettings} args.settings
 * @param {Object} [args.glossary]
 * @param {Object.<string,string>} args.prompts  locale → the per-language prompt text.
 * @param {string|null} [args.generalPrompt]
 * @param {Object} [args.queue]         the pending file's resubmission queue.
 * @returns {Promise<{pages:Array, plan:Object, built:Array<{spec:Object, params:Object, estimate:{input:number, output:number}}>}>}
 */
export async function planBatch({ adapter, catalog, worklist, tmByLang, targets, settings, glossary = {}, prompts, generalPrompt = null, queue = {} }) {
  const pages = adapter && typeof adapter.pages === 'function' ? await adapter.pages() : pagesFromCatalog(catalog);
  const plan = planRequests({
    pages,
    worklist,
    tmByLang,
    targets,
    sectionTokens: settings.sectionTokens,
    attemptLimit: settings.attempts,
    queue,
  });
  const systems = {};
  for (const lang of targets) {
    if (plan.specs.some((spec) => spec.lang === lang)) {
      systems[lang] = buildSystem({ lang, sourceLang: catalog.source_lang, glossary, generalPrompt, languagePrompt: prompts[lang] });
    }
  }
  const built = plan.specs.map((spec) => {
    const params = buildMessageParams(spec, { model: settings.model, system: systems[spec.lang] });
    return { spec, params, estimate: estimateRequest(params) };
  });
  return { pages, plan, built };
}

/**
 * Submits the missing translations as one batch.
 *
 * @param {Object} args
 * @param {ReturnType<import('./store.mjs').createStore>} args.store
 * @param {Object|null} args.adapter            supplies `pages()`; without it, the catalogue's usage files are the pages.
 * @param {string[]} args.targets
 * @param {import('./config.mjs').TranslationSettings} args.settings
 * @param {Object} args.glossary
 * @param {Object.<string,string>} args.prompts  locale → the per-language prompt text.
 * @param {string|null} [args.generalPrompt]     the project general prompt's text, or null without one.
 * @param {boolean} [args.dryRun]
 * @param {() => Object} args.createClient      the one client factory, bound to the configuration.
 * @param {() => string} [args.now]
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {Promise<{code:number, action:string, batchId?:string, canceled?:boolean, selected?:number, deferred?:number}>}
 *          `batchId` is set when a batch was created: `action` is `submitted` when the pending file records it,
 *          `unrecorded` (code 1) when the file could not be written, and `canceled` then says whether the API
 *          accepted its cancellation.
 */
export async function submit({
  store,
  adapter,
  targets,
  settings,
  glossary = {},
  prompts,
  generalPrompt = null,
  dryRun = false,
  createClient,
  now = () => new Date().toISOString(),
  log = (...a) => console.log(...a),
  errlog = (...a) => console.error(...a),
}) {
  const pending = store.readPending();
  if (pending.batches.length > 0 && !dryRun) {
    errlog(
      `submit: batch ${pending.batches.map((b) => b.id).join(', ')} is recorded and not yet collected; ` +
        'run `l10n collect` first. One batch at a time is in flight.'
    );
    return { code: 1, action: 'in-progress' };
  }

  const catalog = store.readSourceCatalog();
  const tmByLang = store.readAllTM(targets);
  const worklist = computeWorklist(catalog, { targets, tmByLang });
  if (worklist.status === 'up-to-date') {
    log('submit: no translation needed: no batch created, no network call.');
    return { code: 0, action: 'noop' };
  }
  if (dryRun && pending.batches.length > 0) {
    log(`submit --dry-run: batch ${pending.batches.map((b) => b.id).join(', ')} is recorded and not yet collected, so a submission now would be refused.`);
  }

  const { plan, built } = await planBatch({ adapter, catalog, worklist, tmByLang, targets, settings, glossary, prompts, generalPrompt, queue: pending.queue });
  for (const lang of targets) {
    const exhausted = plan.exhausted[lang] || [];
    const unplaced = plan.unplaced[lang] || [];
    if (exhausted.length) log(`submit: ${lang}: ${exhausted.length} segment(s) reached the attempt limit and stay untranslated (named in the job log).`);
    if (unplaced.length) errlog(`submit: ${lang}: ${unplaced.length} missing unit(s) appear on no page: the catalogue is older than the content; run extract.`);
  }
  if (plan.specs.length === 0) {
    log('submit: work remains but nothing can be requested: no batch created, no network call.');
    return { code: 0, action: 'nothing-to-request' };
  }

  const { selected, deferred, totals } = selectWithinBudget(built, settings.submission);
  if (selected.length === 0) {
    const first = built[0];
    errlog(
      `submit: the first request, ${describe(first.spec)}, is estimated at ${first.estimate.input} input and ` +
        `${first.estimate.output} output tokens, above the per-submission budget (${settings.submission.inputTokens} input, ` +
        `${settings.submission.outputTokens} output); raise backend.submission or backend.sectionTokens. No batch created.`
    );
    return { code: 1, action: 'over-budget' };
  }

  // The cached share is reported beside the whole input and never subtracted from a budget: a cache hit
  // inside a batch is best-effort, so the budgets count each request's whole input estimate.
  const cached = cachedEstimates(selected.map((r) => r.params));
  selected.forEach((r, index) => {
    r.cached = cached[index];
  });
  const totalCached = cached.reduce((n, c) => n + c, 0);
  const heading = dryRun ? 'submit --dry-run' : 'submit';
  log(`${heading}: ${selected.length} request(s), estimated input ${totals.input} tokens ${inputSplit(totals.input, totalCached)}, estimated output ${totals.output} tokens; ${deferred.length} request(s) left for the next submission.`);
  for (const line of perLocaleLines(selected, targets)) log(line);
  if (dryRun) {
    selected.forEach(({ spec, estimate, cached: share }, index) =>
      log(`  request ${index + 1}: ${describe(spec)}: estimated input ${estimate.input} ${inputSplit(estimate.input, share)}, output ${estimate.output}`)
    );
    log('submit --dry-run: no batch created, no file written.');
    return { code: 0, action: 'dry-run', selected: selected.length, deferred: deferred.length };
  }

  let client;
  try {
    client = createClient();
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      errlog(`submit: ${err.message}`);
      errlog('submit: no network call was made and no file was written.');
      return { code: 1, action: 'missing-key' };
    }
    throw err;
  }

  const requests = [];
  const mapping = {};
  selected.forEach(({ spec, params }, index) => {
    const customId = customIdFor({ index, lang: spec.lang, page: spec.page, section: spec.section });
    requests.push({ custom_id: customId, params });
    mapping[customId] = {
      page: spec.page,
      section: spec.section,
      lang: spec.lang,
      ids: spec.requested,
      attempt: spec.attempt,
      model: params.model,
      fallback: spec.fallback,
    };
  });
  let batch;
  try {
    batch = await client.messages.batches.create({ requests });
  } catch (err) {
    throw classifyClientError(err);
  }
  pending.batches.push({ id: batch.id, createdAt: batch.created_at || now(), requests: mapping });
  try {
    store.writePending(pending);
  } catch (err) {
    // The batch exists and nothing records it, so the next submission would request its units again.
    // The write error is named by its code alone, like every other failure this module reports.
    const why = (err && (err.code || err.name)) || 'Error';
    errlog(`submit: batch ${batch.id} was created, but ${store.paths.pending} could not be written (${why}): the batch is recorded nowhere.`);
    const canceled = await cancelBatch({ batchId: batch.id, createClient });
    if (canceled.code === 0) {
      errlog(
        `submit: batch ${batch.id} was canceled: the API accepted the cancellation (processing status: ${canceled.status}); ` +
          'requests it had already processed may still be billed.'
      );
    } else {
      errlog(`submit: batch ${batch.id} could NOT be canceled (${canceled.reason}): cancel it by hand, or the next submission requests its units again.`);
    }
    return { code: 1, action: 'unrecorded', batchId: batch.id, canceled: canceled.code === 0, selected: selected.length, deferred: deferred.length };
  }
  log(`submit: batch ${batch.id} created with ${requests.length} request(s) and recorded in ${store.paths.pending}.`);
  return { code: 0, action: 'submitted', batchId: batch.id, selected: selected.length, deferred: deferred.length };
}

/** The units of a request's identifiers that the catalogue still holds. */
function requestItems(ids, units) {
  const items = [];
  const gone = [];
  for (const id of ids) {
    const unit = units[id];
    if (!unit) {
      gone.push(id);
      continue;
    }
    items.push({
      srcHash: id,
      source: unit.source,
      format: unit.format || 'text',
      ...(unit.protected !== undefined ? { protected: unit.protected } : {}),
    });
  }
  return { items, gone };
}

const byLangThenKey = (a, b) => (a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : a.srcHash < b.srcHash ? -1 : a.srcHash > b.srcHash ? 1 : 0);

/** Dropped identifiers in a fixed order — locale, page, section, identifier — since results arrive in any order. */
const byDropped = (a, b) => {
  for (const field of ['lang', 'page', 'section', 'id']) {
    const x = a[field] ?? '';
    const y = b[field] ?? '';
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

/**
 * Collects every recorded batch that has ended.
 *
 * @param {Object} args
 * @param {ReturnType<import('./store.mjs').createStore>} args.store
 * @param {import('./config.mjs').TranslationSettings} args.settings
 * @param {Object} args.glossary
 * @param {() => Object} args.createClient
 * @param {(...a:any[])=>void} [args.log]
 * @param {(...a:any[])=>void} [args.errlog]
 * @returns {Promise<{code:number, action:string, applied:number, collected?:string[], waiting?:string[]}>}
 *          `applied` is the number of segments written to the machine layer.
 */
export async function collect({
  store,
  settings,
  glossary = {},
  createClient,
  log = (...a) => console.log(...a),
  errlog = (...a) => console.error(...a),
}) {
  const pending = store.readPending();
  if (pending.batches.length === 0) {
    log('collect: no batch is pending: no network call.');
    return { code: 0, action: 'noop', applied: 0 };
  }
  const { entries: doNotTranslate, caseSensitive } = doNotTranslateOf(glossary);
  let client;
  try {
    client = createClient();
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      errlog(`collect: ${err.message}`);
      errlog('collect: no network call was made and no file was written.');
      return { code: 1, action: 'missing-key', applied: 0 };
    }
    throw err;
  }

  const units = (store.readSourceCatalog().units) || {};
  const fallbackId = settings.model.fallbackId;
  const remaining = [];
  const collected = [];
  const waiting = [];
  let applied = 0;

  for (const record of pending.batches) {
    let batch;
    try {
      batch = await client.messages.batches.retrieve(record.id);
    } catch (err) {
      throw classifyClientError(err);
    }
    if (batch.processing_status !== 'ended') {
      const counts = batch.request_counts ? `, ${batch.request_counts.processing} request(s) processing` : '';
      log(`collect: batch ${record.id} is ${batch.processing_status}${counts}; left recorded.`);
      remaining.push(record);
      waiting.push(record.id);
      continue;
    }

    const items = [];
    const failures = [];
    const dropped = [];
    const seen = new Set();
    const queueAll = (req, ids, defect, extra = {}) => {
      queueDefect(pending.queue, { lang: req.lang, ids, attempt: req.attempt, defect, wasFallback: Boolean(req.fallback), fallbackId, ...extra });
      for (const id of ids) {
        failures.push({ srcHash: id, lang: req.lang, error: typeof defect === 'string' ? defect : defect[id], attempt: req.attempt });
      }
    };

    const apply = (req, result) => {
      const { items: reqItems, gone } = requestItems(req.ids, units);
      if (gone.length) clearQueued(pending.queue, req.lang, gone);
      const ids = reqItems.map((item) => item.srcHash);
      if (ids.length === 0) return;
      if (!result || result.type !== 'succeeded') {
        const type = result && result.type;
        const reason =
          type === 'errored'
            ? `the request errored${result.error && result.error.error ? ` (${result.error.error.type}: ${result.error.error.message})` : ''}`
            : type === 'canceled' || type === 'expired'
              ? `the request was ${type}`
              : 'no result was returned for the request';
        queueAll(req, ids, reason);
        return;
      }
      const read = readTranslationMessage(result.message);
      if (read.refusal) {
        queueAll(req, ids, refusalDefect(read.refusal), { refusal: true });
        return;
      }
      const validation = validateTranslations({
        items: reqItems,
        entries: read.entries || null,
        replyDefect: read.defect,
        doNotTranslate,
        caseSensitive,
      });
      const { accepted, rejected } = validation;
      for (const id of validation.dropped) dropped.push({ id, lang: req.lang, page: req.page, section: req.section ?? null });
      const entries = {};
      const sources = {};
      for (const item of reqItems) {
        const text = accepted[item.srcHash];
        if (typeof text !== 'string') continue;
        entries[item.srcHash] = { text, status: STATUS.MACHINE, srcHash: item.srcHash, job: record.id, at: record.createdAt };
        sources[item.srcHash] = item.source;
        items.push({ srcHash: item.srcHash, lang: req.lang, source: item.source, text, status: STATUS.MACHINE, model: req.model, attempt: req.attempt });
      }
      if (Object.keys(entries).length > 0) {
        store.writeLayerEntries(LAYER.MACHINE, req.lang, entries);
        store.mergeSourceMap(sources);
        clearQueued(pending.queue, req.lang, Object.keys(entries));
      }
      const rejectedIds = Object.keys(rejected);
      if (rejectedIds.length > 0) queueAll(req, rejectedIds, validation.replyDefect ?? rejected);
    };

    let results;
    try {
      results = await client.messages.batches.results(record.id);
    } catch (err) {
      throw classifyClientError(err);
    }
    for await (const line of results) {
      const req = record.requests[line.custom_id];
      if (!req) {
        errlog(`collect: batch ${record.id}: a result for the unknown custom identifier ${JSON.stringify(line.custom_id)} was ignored.`);
        continue;
      }
      if (seen.has(line.custom_id)) continue;
      seen.add(line.custom_id);
      apply(req, line.result);
    }
    for (const [customId, req] of Object.entries(record.requests)) {
      if (!seen.has(customId)) apply(req, null);
    }

    const exhausted = failures
      .filter((f) => {
        const entry = pending.queue[f.lang] && pending.queue[f.lang][f.srcHash];
        return entry && entry.attempts >= settings.attempts;
      })
      .map(({ srcHash, lang, error }) => ({ srcHash, lang, error }));
    const result = failures.length === 0 ? RESULT.OK : items.length === 0 ? RESULT.FAILED : RESULT.PARTIAL;
    dropped.sort(byDropped);
    /** @type {import('./types.mjs').JobLog} */
    const job = {
      id: record.id,
      at: record.createdAt,
      trigger: 'collect',
      items: items.sort(byLangThenKey),
      failures: failures.sort(byLangThenKey),
      exhausted: exhausted.sort(byLangThenKey),
      ...(dropped.length ? { dropped } : {}),
      result,
    };
    const jobFile = store.appendJobLog(job);
    log(
      `collect: batch ${record.id} ended: ${items.length} segment(s) written to the machine layer, ` +
        `${failures.length - exhausted.length} queued for resubmission, ${exhausted.length} at the attempt limit; job=${jobFile}`
    );
    for (const f of exhausted) log(`  untranslated after ${settings.attempts} attempts: ${f.lang} ${f.srcHash}: ${f.error}`);
    for (const d of dropped) log(`  dropped an identifier the request did not ask for: ${describe(d)}: ${JSON.stringify(d.id)}`);
    collected.push(record.id);
    applied += items.length;
  }

  pending.batches = remaining;
  store.writePending(pending);
  return { code: 0, action: collected.length ? 'collected' : 'waiting', applied, collected, waiting };
}

/**
 * Asks the Message Batches API to cancel a batch. It never throws, never prints
 * and writes no file: a failure — no client, or the API refusing or not
 * answering — is returned with its error's class and HTTP status alone, never
 * the error's message, so no text an error carries reaches a log.
 *
 * @param {Object} args
 * @param {string} args.batchId
 * @param {() => Object} args.createClient   the one client factory, bound to the configuration.
 * @returns {Promise<{code:number, action:'canceled'|'cancel-failed', batchId:string, status?:string, reason?:string}>}
 *          `status` is the processing status the API answered; `reason` names the failure.
 */
export async function cancelBatch({ batchId, createClient }) {
  try {
    const client = createClient();
    const batch = await client.messages.batches.cancel(batchId);
    return { code: 0, action: 'canceled', batchId, status: (batch && batch.processing_status) || 'canceling' };
  } catch (err) {
    const kind = (err && err.constructor && err.constructor.name !== 'Object' && err.constructor.name) || 'Error';
    const status = err && typeof err.status === 'number' ? `, HTTP ${err.status}` : '';
    return { code: 1, action: 'cancel-failed', batchId, reason: `${kind}${status}` };
  }
}

/**
 * Prints what the pending file records: the batches not yet collected, and per
 * locale the queued segments and those at the attempt limit. No network call.
 *
 * @param {Object} args
 * @param {ReturnType<import('./store.mjs').createStore>} args.store
 * @param {import('./config.mjs').TranslationSettings} args.settings
 * @param {(...a:any[])=>void} [args.log]
 * @returns {{code:number, batches:number}}
 */
export function status({ store, settings, log = (...a) => console.log(...a) }) {
  const pending = store.readPending();
  if (pending.batches.length === 0) log('status: no batch is pending.');
  for (const record of pending.batches) {
    const reqs = Object.values(record.requests || {});
    const langs = [...new Set(reqs.map((r) => r.lang))].sort();
    log(`status: batch ${record.id}, created ${record.createdAt}: ${reqs.length} request(s) (${langs.join(', ')}); run \`l10n collect\` to apply it once it has ended.`);
  }
  const langs = Object.keys(pending.queue).sort();
  if (langs.length === 0) log('status: the resubmission queue is empty.');
  for (const lang of langs) {
    const entries = Object.entries(pending.queue[lang]);
    const atLimit = entries.filter(([, e]) => e.attempts >= settings.attempts);
    log(`status: ${lang}: ${entries.length - atLimit.length} segment(s) queued for resubmission, ${atLimit.length} at the attempt limit.`);
    for (const [id, e] of atLimit) log(`  untranslated after ${e.attempts} attempts: ${id}: ${e.defect}`);
  }
  return { code: 0, batches: pending.batches.length };
}

export default { submit, collect, status, cancelBatch, planBatch, selectWithinBudget, MAX_BATCH_REQUESTS };
