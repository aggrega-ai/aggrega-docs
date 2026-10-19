/**
 * store.mjs — Durable I/O of the translation engine: the catalogue, the two
 * memory layers, the source map, the archives and the job log.
 *
 * READS and WRITES the on-disk layout under `baseDir`, the project's memory
 * directory (`memory.dir` in the configuration):
 *
 *   <baseDir>/source.json                     source catalogue (derived by extract)
 *   <baseDir>/messages/<lang>.json            HUMAN layer, one file per language
 *   <baseDir>/machine/<lang>.json             MACHINE layer, one file per language
 *   <baseDir>/messages/_source.json           map srcHash → source (collision / orphan detection)
 *   <baseDir>/messages/_archive/<lang>.json   human entries archived by the collector
 *   <baseDir>/machine/_archive/<lang>.json    machine entries archived by the collector
 *   <baseDir>/seed-report.json                the coverage report `seed` writes
 *   <baseDir>/jobs/<ts>-<id>.json             job log (one file per job)
 *   <baseDir>/pending.json                    the recorded batches and the resubmission queue
 *                                             (`submit` and `collect`; shapes in pending.mjs)
 *
 * It never writes anywhere else, and in particular never into the content tree.
 *
 * TWO LAYERS, ONE WRITER EACH. People and `seed` write the human layer;
 * translation runs write the machine layer. Every write names its layer, so no
 * code path can write "the memory" without saying which one. A LOOKUP is the
 * union of the two, and the human entry wins wherever both carry a key: a
 * correction made by a person is never shadowed by a machine translation.
 *
 * INVARIANTS
 * - Every WRITE is crash-safe: a temporary file is written and then renamed
 *   atomically (fs.rename). A partial failure never leaves a corrupt data file
 *   behind: either the old content stays or the new one appears, never a hybrid.
 *   The temporary file is removed on error.
 * - Memory writes are per-record or per-batch, so an interruption halfway through
 *   a run does not lose what has already been written.
 * - READING a missing file (a layer, the catalogue, the source map) returns an
 *   empty object rather than an error. Directories are created at write time, so
 *   a layer nobody has written yet is simply absent.
 * - JSON is pretty-printed at 2 spaces with stably ordered keys, for diffs that
 *   are clean and reviewable.
 *
 * INJECTABLE DEPENDENCIES: `fsImpl` lets tests simulate a write failure (for
 * example a renameSync that throws) and assert atomicity. It defaults to the
 * node:fs module.
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { LAYER } from './types.mjs';
import { emptyPending } from './pending.mjs';

const LAYER_DIR = Object.freeze({ [LAYER.HUMAN]: 'messages', [LAYER.MACHINE]: 'machine' });

/**
 * Stable serialization: recursively sorts object keys (arrays keep their order)
 * and prints at 2 spaces. Sorted keys mean deterministic diffs even when the
 * maps grow in arbitrary order.
 *
 * @param {*} value
 * @returns {string}
 */
export function stableStringify(value) {
  const seen = new WeakSet();
  const order = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) {
      // A circular reference: JSON.stringify would throw anyway, so throw here
      // with a message naming the cause.
      throw new TypeError('stableStringify: circular reference');
    }
    seen.add(v);
    let out;
    if (Array.isArray(v)) {
      out = v.map(order);
    } else {
      out = {};
      for (const k of Object.keys(v).sort()) out[k] = order(v[k]);
    }
    seen.delete(v);
    return out;
  };
  return JSON.stringify(order(value), null, 2) + '\n';
}

function assertLayer(layer) {
  if (!Object.prototype.hasOwnProperty.call(LAYER_DIR, layer)) {
    throw new TypeError(`unknown memory layer "${layer}"; expected one of: ${Object.keys(LAYER_DIR).join(', ')}`);
  }
}

/**
 * Creates a store bound to a memory directory. The methods are synchronous,
 * because this runs at build time and never at runtime.
 *
 * @param {Object} opts
 * @param {string} opts.baseDir  The memory directory (absolute). Required: the
 *                               store derives no location of its own.
 * @param {typeof nodeFs} [opts.fsImpl]  Injectable fs implementation (a test seam).
 */
export function createStore({ baseDir, fsImpl = nodeFs } = {}) {
  if (typeof baseDir !== 'string' || baseDir === '') {
    throw new TypeError('createStore: baseDir (the memory directory) is required');
  }
  const fs = fsImpl;

  const layerFile = (layer, lang) => {
    assertLayer(layer);
    return path.join(baseDir, LAYER_DIR[layer], `${lang}.json`);
  };
  const archiveFile = (layer, lang) => {
    assertLayer(layer);
    return path.join(baseDir, LAYER_DIR[layer], '_archive', `${lang}.json`);
  };

  const paths = {
    baseDir,
    source: path.join(baseDir, 'source.json'),
    messagesDir: path.join(baseDir, LAYER_DIR[LAYER.HUMAN]),
    machineDir: path.join(baseDir, LAYER_DIR[LAYER.MACHINE]),
    sourceMap: path.join(baseDir, LAYER_DIR[LAYER.HUMAN], '_source.json'),
    jobsDir: path.join(baseDir, 'jobs'),
    seedReport: path.join(baseDir, 'seed-report.json'),
    pending: path.join(baseDir, 'pending.json'),
    layer: layerFile,
    archive: archiveFile,
  };

  function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Reads and parses a JSON file; returns `fallback` when the file is absent. */
  function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  }

  /**
   * Crash-safe atomic write: temp file plus rename. On error it removes the
   * temporary file and re-throws, leaving any pre-existing file intact.
   */
  function atomicWrite(file, value) {
    ensureDir(path.dirname(file));
    const data = stableStringify(value);
    const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
      fs.writeFileSync(tmp, data, 'utf8');
      fs.renameSync(tmp, file);
    } catch (err) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* best-effort cleanup */
      }
      throw err;
    }
  }

  // -- Source catalogue ---------------------------------------------------

  /** @returns {import('./types.mjs').SourceCatalog|Object} the catalogue, or {} when absent. */
  function readSourceCatalog() {
    return readJson(paths.source, {});
  }

  function writeSourceCatalog(catalog) {
    atomicWrite(paths.source, catalog);
  }

  // -- The two memory layers ----------------------------------------------

  /** @returns {import('./types.mjs').TM} one layer of a language, or {} when absent. */
  function readLayer(layer, lang) {
    return readJson(layerFile(layer, lang), {});
  }

  /** Replaces one layer of a language with `tm` (atomically). */
  function writeLayer(layer, lang, tm) {
    atomicWrite(layerFile(layer, lang), tm);
  }

  /**
   * Merges a batch of entries into one layer of a language and writes once
   * (atomically). Crash-safe per batch: if the write fails, the layer on disk
   * stays at the previous batch.
   *
   * @param {string} layer  `LAYER.HUMAN` or `LAYER.MACHINE`.
   * @param {string} lang
   * @param {Object.<string, import('./types.mjs').TMEntry>} entries
   */
  function writeLayerEntries(layer, lang, entries) {
    const tm = readLayer(layer, lang);
    for (const [key, entry] of Object.entries(entries)) tm[key] = entry;
    writeLayer(layer, lang, tm);
  }

  /**
   * The LOOKUP view of a language's memory: the machine layer overlaid by the
   * human layer, so a key both carry resolves to the human entry.
   *
   * @returns {import('./types.mjs').TM}
   */
  function readTM(lang) {
    return { ...readLayer(LAYER.MACHINE, lang), ...readLayer(LAYER.HUMAN, lang) };
  }

  /** The lookup view of several languages → { [lang]: TM }. */
  function readAllTM(langs) {
    const out = {};
    for (const lang of langs) out[lang] = readTM(lang);
    return out;
  }

  /** Lists the languages either layer holds on disk (excluding `_`-prefixed files). */
  function listLangs() {
    const langs = new Set();
    for (const dir of [paths.messagesDir, paths.machineDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const n of fs.readdirSync(dir)) {
        if (n.endsWith('.json') && !n.startsWith('_')) langs.add(n.slice(0, -'.json'.length));
      }
    }
    return [...langs].sort();
  }

  // -- Source map (srcHash → source) --------------------------------------

  function readSourceMap() {
    return readJson(paths.sourceMap, {});
  }

  function writeSourceMap(map) {
    atomicWrite(paths.sourceMap, map);
  }

  /** Merges new srcHash→source pairs into the source map and writes (atomically). */
  function mergeSourceMap(entries) {
    const map = readSourceMap();
    for (const [key, source] of Object.entries(entries)) map[key] = source;
    writeSourceMap(map);
  }

  // -- Job log (append-only) ----------------------------------------------

  /**
   * Writes a job-log file, `<ts>-<id>.json`. A job is one file: a translation
   * run's id is fresh, so its file is new; a collection's id and time are its
   * batch's, so applying the same batch again rewrites the same file with the
   * same content.
   *
   * @param {import('./types.mjs').JobLog} job
   * @returns {string} the path of the file written.
   */
  function appendJobLog(job) {
    const ts = String(job.at || new Date().toISOString()).replace(/[:.]/g, '-');
    const file = path.join(paths.jobsDir, `${ts}-${job.id}.json`);
    atomicWrite(file, job);
    return file;
  }

  /** Lists the job-log files present, sorted. */
  function listJobs() {
    if (!fs.existsSync(paths.jobsDir)) return [];
    return fs
      .readdirSync(paths.jobsDir)
      .filter((n) => n.endsWith('.json'))
      .sort();
  }

  // -- Pending file (the one reader and writer) ---------------------------

  /**
   * Reads the pending file: the recorded batches and the resubmission queue.
   * An absent file records nothing.
   *
   * @returns {import('./types.mjs').PendingFile}
   */
  function readPending() {
    const value = readJson(paths.pending, null);
    if (!value) return emptyPending();
    return { batches: Array.isArray(value.batches) ? value.batches : [], queue: value.queue || {} };
  }

  /**
   * Writes the pending file (atomically).
   *
   * @param {import('./types.mjs').PendingFile} value
   */
  function writePending(value) {
    atomicWrite(paths.pending, { batches: value.batches || [], queue: value.queue || {} });
  }

  // -- Archive (non-destructive collection) -------------------------------

  function readArchive(layer, lang) {
    return readJson(archiveFile(layer, lang), {});
  }

  /**
   * Every text the memory holds for a language: the entries of both layers and
   * of both archives, whichever key each sits under. The drift guard reads it to
   * tell a target leaf that lags its source (its text is a translation the
   * memory still holds) from one edited by hand (its text is nowhere).
   *
   * @param {string} lang
   * @returns {Set<string>}
   */
  function memoryTexts(lang) {
    const texts = new Set();
    for (const layer of [LAYER.HUMAN, LAYER.MACHINE]) {
      for (const tm of [readLayer(layer, lang), readArchive(layer, lang)]) {
        for (const entry of Object.values(tm)) {
          if (entry && typeof entry.text === 'string') texts.add(entry.text);
        }
      }
    }
    return texts;
  }

  /**
   * Every source text the memory directory records: the catalogue's units and
   * the source map's values, which keep the source of a key after its text has
   * left the content. The drift guard counts a target leaf holding one as lag.
   *
   * @returns {Set<string>}
   */
  function recordedSourceTexts() {
    const texts = new Set();
    for (const unit of Object.values(readSourceCatalog().units || {})) {
      if (unit && typeof unit.source === 'string') texts.add(unit.source);
    }
    for (const source of Object.values(readSourceMap())) if (typeof source === 'string') texts.add(source);
    return texts;
  }

  /**
   * Moves a set of keys out of the live memory of a language, in BOTH layers,
   * each into the archive beside its own layer — so the collector, too, writes a
   * layer's files only next to that layer. Non-destructive: the entries stay
   * recoverable. Per layer it writes the archive first and the reduced layer
   * second; both writes are atomic.
   *
   * @param {string} lang
   * @param {string[]} keys
   * @returns {number} the number of distinct keys that left the live memory.
   */
  function archiveKeys(lang, keys) {
    const moved = new Set();
    for (const layer of [LAYER.HUMAN, LAYER.MACHINE]) {
      const tm = readLayer(layer, lang);
      const archive = readArchive(layer, lang);
      let changed = false;
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(tm, key)) {
          archive[key] = tm[key];
          delete tm[key];
          moved.add(key);
          changed = true;
        }
      }
      if (changed) {
        atomicWrite(archiveFile(layer, lang), archive);
        writeLayer(layer, lang, tm);
      }
    }
    return moved.size;
  }

  return {
    paths,
    stableStringify,
    // catalogue
    readSourceCatalog,
    writeSourceCatalog,
    // memory layers
    readLayer,
    writeLayer,
    writeLayerEntries,
    readTM,
    readAllTM,
    listLangs,
    // source map
    readSourceMap,
    writeSourceMap,
    mergeSourceMap,
    // job log
    appendJobLog,
    listJobs,
    // pending file
    readPending,
    writePending,
    // archive
    readArchive,
    archiveKeys,
    // every text, live and archived, and every recorded source text, for the drift guard
    memoryTexts,
    recordedSourceTexts,
  };
}

export default { createStore, stableStringify };
