/**
 * engine.mjs — Orchestration of the translation engine (site-agnostic,
 * dependency-injected).
 *
 * The engine knows neither the site's content model nor the translation backend:
 * both are INJECTED.
 *   - `adapter` (per content model): `extract()`→catalog (plus optional `stats`,
 *     counts the adapter reports about what it read),
 *     `pages()`→the ordered pages a request is built from (see `requests.mjs`),
 *     `generate({tmByLang})`→writes the target artifacts,
 *     `seedAlign?({store, targets})`→seed pairs. It defines what "translatable"
 *     means. An adapter without `pages()` gets one page per catalogue usage file.
 *   - `backend` (the translator): `async translate({request, items, lang, sourceLang, glossary})`
 *     → the reply as `{entries:[{id,text}]}`, `{translations:{id→text}}` or a
 *     bare `{id→text}` map, or `{refusal}` / `{defect}`, with an optional `model`.
 *     `request` is the planned request; `items` are its requested units, each with
 *     its `srcHash`, `source`, `format` and, when the unit has them, its `context`
 *     and `protected` spans.
 *
 * The engine's own responsibilities: catalog and memory I/O (through the store),
 * the mechanical gate, the translate stage — page requests from the one request
 * builder, bounded concurrency, retry and backoff on transient errors only, the
 * one validation of every reply, resubmission of rejected and refused segments up
 * to the attempt limit, crash-safe per-request memory writes — a job log, and
 * non-destructive collection of orphans.
 *
 * THE LAYERS. A translation run writes only the MACHINE layer; `seed` writes only
 * the HUMAN layer. Every read the gate and generation make is the lookup view, in
 * which the human entry wins.
 *
 * READS and WRITES only through the store — the memory directory's
 * `source.json`, `messages/`, `machine/` and `jobs/`. It never touches the
 * content tree; writing target-locale artifacts is the adapter's job.
 *
 * No network call lives in here: the injected backend encapsulates it, and the
 * tests inject a fake backend.
 */

import { createStore } from './store.mjs';
import { computeWorklist, orphanKeys } from './gate.mjs';
import { LAYER, STATUS, RESULT } from './types.mjs';
import { TRANSLATION_DEFAULTS } from './config.mjs';
import { doNotTranslateOf, isTransient } from './translator-prompt.mjs';
import { pagesFromCatalog, planRequests } from './requests.mjs';
import { validateTranslations } from './validate.mjs';
import { clearQueued, queueDefect, refusalDefect } from './pending.mjs';

/**
 * The engine's defaults. `attempts` bounds the retries of one call on a
 * transient error; `attemptLimit` bounds the requests per segment when its
 * translation is rejected or refused.
 */
const DEFAULTS = {
  concurrency: 4,
  attempts: 3,
  backoffMs: 500,
  model: undefined,
  attemptLimit: TRANSLATION_DEFAULTS.attempts,
  sectionTokens: TRANSLATION_DEFAULTS.sectionTokens,
  fallbackId: undefined,
};

/** The reply's entries, whichever of the accepted shapes a backend returned; null when it carried none. */
function replyEntries(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Array.isArray(raw.entries)) return raw.entries;
  if (raw.refusal || typeof raw.defect === 'string') return null;
  const map = raw.translations && typeof raw.translations === 'object' ? raw.translations : raw;
  return Object.entries(map)
    .filter(([id]) => id !== 'model' && id !== 'tokensById')
    .map(([id, text]) => ({ id, text }));
}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` with retry and backoff on transient errors ONLY. Application errors
 * are not retried: they propagate immediately.
 */
async function callWithRetry(fn, { attempts, backoffMs, sleep }) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt < attempts && isTransient(err)) {
        await sleep(backoffMs * attempt);
        continue;
      }
      throw err;
    }
  }
  throw last;
}

/** A bounded-concurrency pool: runs `worker(task)` over `tasks` with `size` runners. */
async function runPool(tasks, size, worker) {
  const results = new Array(tasks.length);
  let cursor = 0;
  const runnerCount = Math.max(1, Math.min(size, tasks.length || 1));
  const runners = Array.from({ length: runnerCount }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await worker(tasks[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Creates the engine.
 *
 * @param {Object} cfg
 * @param {Object} [cfg.adapter]   The per-site adapter (extract/pages/generate/seedAlign).
 * @param {Object} [cfg.backend]   The translation backend (translate()).
 * @param {Object} cfg.paths       { baseDir }: the memory directory, required.
 * @param {Object} [cfg.options]   { concurrency, attempts, backoffMs, model,
 *                                   attemptLimit, sectionTokens, fallbackId,
 *                                   idGen, now, sleep, fsImpl }.
 */
export function createEngine({ adapter = null, backend = null, paths = {}, options = {} } = {}) {
  const store = createStore({ baseDir: paths.baseDir, fsImpl: options.fsImpl });
  const opt = { ...DEFAULTS, ...options };
  const now = options.now || (() => new Date().toISOString());
  const idGen =
    options.idGen ||
    (() => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4));
  const sleep = options.sleep || sleepReal;

  /**
   * extract — delegates catalog production to the adapter, then persists it
   * (source.json) and updates the source map (srcHash→source). Returns the
   * catalog, its unit count and, when the adapter reports them, its `stats`.
   */
  async function extract() {
    if (!adapter || typeof adapter.extract !== 'function') {
      throw new Error('adapter.extract is not configured');
    }
    const produced = await adapter.extract();
    if (!produced || typeof produced.source_lang !== 'string' || produced.source_lang === '') {
      throw new Error('adapter.extract returned a catalog with no source_lang');
    }
    const units = produced.units || {};
    const catalog = {
      generated_at: produced.generated_at || now(),
      source_lang: produced.source_lang,
      units,
    };
    store.writeSourceCatalog(catalog);
    const sourceMap = {};
    for (const [key, unit] of Object.entries(units)) sourceMap[key] = unit.source;
    store.mergeSourceMap(sourceMap);
    return {
      catalog,
      unitCount: Object.keys(units).length,
      ...(produced.stats !== undefined ? { stats: produced.stats } : {}),
    };
  }

  /**
   * gate — reads the catalog plus the targets' TM from disk and computes the
   * worklist. Free of token cost: hashing and set arithmetic only.
   */
  function gate({ targets }) {
    const catalog = store.readSourceCatalog();
    const tmByLang = store.readAllTM(targets || []);
    return computeWorklist(catalog, { targets: targets || [], tmByLang });
  }

  /**
   * translate — the synchronous translate stage. Reads the worklist, plans the
   * page requests (`requests.mjs`), sends each through the backend with bounded
   * concurrency and transient retry/backoff, validates every reply
   * (`validate.mjs`), writes the accepted segments to the MACHINE layer per
   * request (crash-safe) as it goes, and plans again for the rejected and
   * refused ones, stating each defect, until none is left or the attempt limit
   * is reached. A request that throws after its transient retries fails its
   * segments for this run. Every segment left untranslated is named in the job
   * log, which is appended at the end, and so is every identifier a reply
   * returned that its request did not ask for, which is dropped (`dropped`). The
   * human layer is read, never written.
   * Returns { result, job, jobFile, worklist }.
   */
  async function translate({ targets, glossary = {}, trigger = 'dispatch', languagesAdded } = {}) {
    if (!backend || typeof backend.translate !== 'function') {
      throw new Error('backend.translate is not configured');
    }
    const langs = targets || [];
    const { entries: doNotTranslate, caseSensitive } = doNotTranslateOf(glossary);
    const catalog = store.readSourceCatalog();
    const worklist = computeWorklist(catalog, { targets: langs, tmByLang: store.readAllTM(langs) });
    if (worklist.status === 'up-to-date') {
      return { result: RESULT.OK, job: null, jobFile: null, worklist };
    }

    const jobId = idGen();
    const jobAt = now();
    /** @type {import('./types.mjs').JobItem[]} */
    const jobItems = [];
    /** @type {import('./types.mjs').JobDropped[]} */
    const dropped = [];
    const hardFailures = new Map(); // `${lang} ${srcHash}` → the error that ended it this run
    const queue = {};
    const pages = adapter && typeof adapter.pages === 'function' ? await adapter.pages() : pagesFromCatalog(catalog);
    let unplaced = {};

    for (let round = 1; round <= opt.attemptLimit; round++) {
      const tmByLang = store.readAllTM(langs);
      const current = computeWorklist(catalog, { targets: langs, tmByLang });
      if (current.status === 'up-to-date') break;
      const open = {
        ...current,
        items: current.items
          .map((it) => ({ ...it, missing: it.missing.filter((lang) => !hardFailures.has(`${lang} ${it.srcHash}`)) }))
          .filter((it) => it.missing.length > 0),
      };
      const plan = planRequests({
        pages,
        worklist: open,
        tmByLang,
        targets: langs,
        sectionTokens: opt.sectionTokens,
        attemptLimit: opt.attemptLimit,
        queue,
      });
      if (round === 1) unplaced = plan.unplaced;
      if (plan.specs.length === 0) break;

      await runPool(plan.specs, opt.concurrency, async (spec) => {
        const { lang } = spec;
        let raw;
        try {
          raw = await callWithRetry(
            () => backend.translate({ request: spec, items: spec.items, lang, sourceLang: catalog.source_lang, glossary }),
            { attempts: opt.attempts, backoffMs: opt.backoffMs, sleep }
          );
        } catch (err) {
          const error = String((err && err.message) || err);
          for (const id of spec.requested) hardFailures.set(`${lang} ${id}`, error);
          return;
        }
        if (raw && raw.refusal) {
          queueDefect(queue, {
            lang,
            ids: spec.requested,
            attempt: spec.attempt,
            defect: refusalDefect(raw.refusal),
            refusal: true,
            wasFallback: spec.fallback,
            fallbackId: opt.fallbackId,
          });
          return;
        }
        const model = (raw && raw.model) || opt.model;
        const validation = validateTranslations({
          items: spec.items,
          entries: replyEntries(raw),
          replyDefect: raw && raw.defect,
          doNotTranslate,
          caseSensitive,
        });
        const { accepted, rejected } = validation;
        for (const id of validation.dropped) dropped.push({ id, lang, page: spec.page, section: spec.section ?? null });
        const entries = {};
        const sources = {};
        for (const item of spec.items) {
          const text = accepted[item.srcHash];
          if (typeof text !== 'string') continue;
          /** @type {import('./types.mjs').TMEntry} */
          entries[item.srcHash] = { text, status: STATUS.MACHINE, srcHash: item.srcHash, job: jobId, at: jobAt };
          sources[item.srcHash] = item.source;
          const jobItem = { srcHash: item.srcHash, lang, source: item.source, text, status: STATUS.MACHINE, attempt: spec.attempt };
          if (model) jobItem.model = model;
          jobItems.push(jobItem);
        }
        // Crash-safe per-request write: whatever is accepted is persisted before
        // the next request's reply is read.
        if (Object.keys(entries).length > 0) {
          store.writeLayerEntries(LAYER.MACHINE, lang, entries);
          store.mergeSourceMap(sources);
          clearQueued(queue, lang, Object.keys(entries));
        }
        const rejectedIds = Object.keys(rejected);
        if (rejectedIds.length > 0) {
          queueDefect(queue, { lang, ids: rejectedIds, attempt: spec.attempt, defect: validation.replyDefect ?? rejected, wasFallback: spec.fallback, fallbackId: opt.fallbackId });
        }
      });
    }

    // Every slot still missing is named, with why.
    const finalTm = store.readAllTM(langs);
    /** @type {import('./types.mjs').JobFailure[]} */
    const failures = [];
    for (const item of worklist.items) {
      for (const lang of item.missing) {
        if (Object.prototype.hasOwnProperty.call(finalTm[lang] || {}, item.srcHash)) continue;
        const queued = queue[lang] && queue[lang][item.srcHash];
        const error =
          hardFailures.get(`${lang} ${item.srcHash}`) ||
          (queued
            ? `${queued.defect} (after ${queued.attempts} attempt${queued.attempts === 1 ? '' : 's'})`
            : (unplaced[lang] || []).includes(item.srcHash)
              ? 'appears on no page: the catalogue is older than the content; run extract'
              : 'not translated');
        failures.push({ srcHash: item.srcHash, lang, error });
      }
    }

    const result =
      failures.length === 0
        ? RESULT.OK
        : jobItems.length === 0
          ? RESULT.FAILED
          : RESULT.PARTIAL;

    /** @type {import('./types.mjs').JobLog} */
    const job = { id: jobId, at: jobAt, trigger, items: jobItems, failures, result };
    if (languagesAdded && languagesAdded.length) job.languages_added = languagesAdded;
    if (dropped.length) job.dropped = dropped;
    const jobFile = store.appendJobLog(job);

    return { result, job, jobFile, worklist };
  }

  /**
   * generate — delegates the rewriting of the target artifacts to the adapter,
   * handing it the TM per language.
   */
  async function generate({ targets } = {}) {
    if (!adapter || typeof adapter.generate !== 'function') {
      throw new Error('adapter.generate is not configured');
    }
    const langs = targets && targets.length ? targets : store.listLangs();
    const tmByLang = store.readAllTM(langs);
    const outcome = await adapter.generate({ tmByLang, store, targets: langs });
    return outcome || { targets: langs };
  }

  /**
   * seed — imports existing translation pairs as `seed` entries into the HUMAN
   * layer. The adapter supplies the alignment (and receives the store, so it
   * compares against the layer being written and writes its report beside the
   * memory); the engine stamps status and `at` and persists the human layer plus
   * the source map. The machine layer is never written. The adapter returns
   * { entriesByLang: {lang:{key:{text,...}}}, sourceEntries?:{key:source} }.
   *
   * @param {Object} [args]
   * @param {string[]} [args.targets]  the target locales to seed (the adapter's default when absent).
   */
  async function seed({ targets } = {}) {
    if (!adapter || typeof adapter.seedAlign !== 'function') {
      throw new Error('adapter.seedAlign is not configured');
    }
    const aligned = (await adapter.seedAlign({ store, targets })) || {};
    const entriesByLang = aligned.entriesByLang || {};
    const at = now();
    let seeded = 0;
    for (const [lang, entries] of Object.entries(entriesByLang)) {
      const stamped = {};
      for (const [key, value] of Object.entries(entries)) {
        stamped[key] = {
          text: value.text,
          status: value.status || STATUS.SEED,
          srcHash: key,
          at: value.at || at,
        };
        seeded += 1;
      }
      if (Object.keys(stamped).length > 0) store.writeLayerEntries(LAYER.HUMAN, lang, stamped);
    }
    if (aligned.sourceEntries) store.mergeSourceMap(aligned.sourceEntries);
    return { seeded, languages: Object.keys(entriesByLang) };
  }

  /**
   * gc — identifies the orphaned memory keys (those with no use in the catalog)
   * and, past the grace period, archives them from both layers, each beside its
   * own layer. Non-destructive by default (apply=false): it merely reports the
   * candidates.
   *
   * @param {Object} [args]
   * @param {number} [args.graceDays]  Grace days counted from the entry's `at` (default 0).
   * @param {boolean} [args.apply]     When true, archives the eligible candidates.
   */
  function gc({ graceDays = 0, apply = false } = {}) {
    const catalog = store.readSourceCatalog();
    const langs = store.listLangs();
    const tmByLang = store.readAllTM(langs);
    const orphans = orphanKeys(catalog, tmByLang);
    const orphanSet = new Set(orphans);
    const cutoff = Date.now() - graceDays * 24 * 60 * 60 * 1000;

    const byLang = {};
    for (const lang of langs) {
      const tm = tmByLang[lang] || {};
      const eligible = [];
      for (const key of Object.keys(tm)) {
        if (!orphanSet.has(key)) continue;
        const at = tm[key] && tm[key].at ? Date.parse(tm[key].at) : NaN;
        // With no valid `at`, an entry counts as eligible only when graceDays=0.
        const olderThanGrace = Number.isNaN(at) ? graceDays === 0 : at <= cutoff;
        if (olderThanGrace) eligible.push(key);
      }
      eligible.sort();
      let archived = 0;
      if (apply && eligible.length > 0) archived = store.archiveKeys(lang, eligible);
      byLang[lang] = { eligible, archived };
    }

    return { orphans, byLang, applied: !!apply };
  }

  return { store, extract, gate, translate, generate, seed, gc };
}

export default { createEngine };
