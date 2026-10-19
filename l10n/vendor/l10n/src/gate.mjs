/**
 * gate.mjs — The mechanical gate: a set difference of catalog × target languages
 * against the translation memory.
 *
 * READS nothing and WRITES nothing — pure functions over the structures its
 * caller supplies. It spends no tokens: the keys are already hashes of the
 * source, so this is plain hashing and set arithmetic.
 *
 * "Changed" needs no separate detector. When a source string changes, its hash
 * changes, so the new key is absent from every language (missing) while the old
 * key is left with no unit in the catalog (orphaned). The gate surfaces both
 * from the difference alone.
 */

/**
 * Computes the orphaned keys: present in some translation memory but with no
 * matching unit in the catalog. Deduplicated and sorted.
 *
 * @param {import('./types.mjs').SourceCatalog} catalog
 * @param {Object.<string, import('./types.mjs').TM>} tmByLang
 * @returns {string[]}
 */
export function orphanKeys(catalog, tmByLang) {
  const units = (catalog && catalog.units) || {};
  const orphans = new Set();
  for (const tm of Object.values(tmByLang || {})) {
    for (const key of Object.keys(tm || {})) {
      if (!Object.prototype.hasOwnProperty.call(units, key)) orphans.add(key);
    }
  }
  return [...orphans].sort();
}

/**
 * Computes the worklist: for every source unit × every target language, a key
 * missing from that language's TM is a slot to translate. A PURE function.
 *
 * @param {import('./types.mjs').SourceCatalog} catalog
 * @param {Object} opts
 * @param {string[]} opts.targets                                     Target languages.
 * @param {Object.<string, import('./types.mjs').TM>} opts.tmByLang   TM per language.
 * @returns {import('./types.mjs').Worklist}
 */
export function computeWorklist(catalog, { targets, tmByLang }) {
  const units = (catalog && catalog.units) || {};
  const langs = [...(targets || [])];
  const tm = tmByLang || {};

  const items = [];
  // Deterministic order: the catalog keys, sorted.
  for (const key of Object.keys(units).sort()) {
    const unit = units[key];
    const missing = langs.filter(
      (lang) => !Object.prototype.hasOwnProperty.call(tm[lang] || {}, key)
    );
    if (missing.length === 0) continue;
    /** @type {import('./types.mjs').WorklistItem} */
    const item = {
      srcHash: key,
      source: unit.source,
      format: unit.format || 'text',
      missing,
    };
    if (unit.context !== undefined) item.context = unit.context;
    if (unit.protected !== undefined) item.protected = unit.protected;
    items.push(item);
  }

  const orphans = orphanKeys(catalog, tm);

  if (items.length === 0) {
    // Nothing to translate. Orphans do not block the gate, being collection
    // maintenance: they are reported only when present, so the collector can
    // read them even in the up-to-date case.
    const worklist = { status: 'up-to-date' };
    if (orphans.length > 0) worklist.orphans = orphans;
    return worklist;
  }

  return { status: 'work', targets: langs, items, orphans };
}

/**
 * A human-readable line summarizing a worklist.
 * - up-to-date → "no translation needed"
 * - work       → "N strings, M language slots to translate"
 *   (N = the number of strings, M = the sum of missing languages across them)
 *
 * @param {import('./types.mjs').Worklist} worklist
 * @returns {string}
 */
export function humanLine(worklist) {
  if (!worklist || worklist.status === 'up-to-date') {
    return 'no translation needed';
  }
  const items = worklist.items || [];
  const strings = items.length;
  const slots = items.reduce((acc, it) => acc + (it.missing ? it.missing.length : 0), 0);
  return `${strings} strings, ${slots} language slots to translate`;
}

/**
 * Is there work left? Convenient for the exit code of `--check`.
 * @param {import('./types.mjs').Worklist} worklist
 * @returns {boolean}
 */
export function hasWork(worklist) {
  return !!worklist && worklist.status === 'work';
}

export default { computeWorklist, orphanKeys, humanLine, hasWork };
