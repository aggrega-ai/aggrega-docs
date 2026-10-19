/**
 * types.mjs — Shared contracts of the translation engine (site-agnostic).
 *
 * Only JSDoc `@typedef` blocks and small constants. No logic: the engine imports
 * these types for documentation and the constants so it never hard-codes a magic
 * string. The shapes match the data structures on disk under the memory
 * directory (`source.json`, `messages/<lang>.json`, `machine/<lang>.json`, the
 * worklist, the job log, `pending.json`) and the pages and requests the
 * translate stage builds.
 *
 * READS nothing and WRITES nothing — it is a declaration module.
 *
 * NOTE on keys: throughout these structures the key (`srcHash`, both as a field
 * and as a map key) is the 16-hex PREFIX of sha256(normalize(source)) — see
 * `keyOf` in normalize.mjs. The full source text is persisted separately
 * (`messages/_source.json`) so a prefix collision is detectable.
 */

/**
 * The two layers of the translation memory, one writer each.
 * - human: written by people and by `seed` — seeded copy, corrections, reviewed
 *   entries. Kept at `messages/<lang>.json`.
 * - machine: written by translation runs. Kept at `machine/<lang>.json`.
 * A lookup prefers the human layer wherever both carry a key.
 * @readonly
 */
export const LAYER = Object.freeze({
  HUMAN: 'human',
  MACHINE: 'machine',
});

/**
 * Permitted values for the status of a Translation Memory entry.
 * - seed: imported from existing translations (for example a hand-built EN).
 * - machine: produced by the machine-translation backend.
 * - human: entered or corrected by hand.
 * - reviewed: reviewed and approved.
 * The machine layer holds `machine` entries; the human layer holds the others.
 * @readonly
 */
export const STATUS = Object.freeze({
  SEED: 'seed',
  MACHINE: 'machine',
  HUMAN: 'human',
  REVIEWED: 'reviewed',
});

/**
 * Possible outcomes of a translation job.
 * - ok: no failures.
 * - partial: some strings translated, others failed.
 * - failed: no string translated.
 * @readonly
 */
export const RESULT = Object.freeze({
  OK: 'ok',
  PARTIAL: 'partial',
  FAILED: 'failed',
});

/**
 * Content format of a source unit.
 * - text: plain text.
 * - html: significant markup, preserved through translation.
 * - markdown: a raw Markdown slice; its protected spans are preserved through
 *   translation.
 * @readonly
 */
export const FORMAT = Object.freeze({
  TEXT: 'text',
  HTML: 'html',
  MARKDOWN: 'markdown',
});

/**
 * @typedef {Object} Usage
 * @property {string} file  Path of the content file (relative to the site root).
 * @property {string} path  Path of the leaf inside that file (e.g. "blocks[3].data.title").
 */

/**
 * A translatable unit, deduplicated across the whole site.
 * @typedef {Object} SourceUnit
 * @property {string} source            Source text (after normalize; for a Markdown unit, the raw slice).
 * @property {string} [context]         Advisory context for the translator (not part of the key).
 * @property {'text'|'html'|'markdown'} format  Content format.
 * @property {Usage[]} usages           Use sites referencing this unit.
 * @property {Array<[number, number]>} [protected]  Ranges of `source` a translation reproduces byte
 *                                      for byte (`[start, end)`, sorted), when the adapter supplies them.
 */

/**
 * Source catalog produced by `extract`.
 * @typedef {Object} SourceCatalog
 * @property {string} generated_at      ISO generation timestamp.
 * @property {string} source_lang       Source language (e.g. "it").
 * @property {Object.<string, SourceUnit>} units  Map of srcHash → unit.
 */

/**
 * A Translation Memory entry (one per target language, keyed by srcHash).
 * @typedef {Object} TMEntry
 * @property {string} text                                   Translated text.
 * @property {'seed'|'machine'|'human'|'reviewed'} status    Provenance / state.
 * @property {string} srcHash                                Key (redundant, but explicit).
 * @property {string} [job]                                  Id of the job that produced it.
 * @property {string} [at]                                   ISO timestamp.
 */

/**
 * The Translation Memory of one language: a map of srcHash → entry. As a lookup
 * it is the union of the two layers, the human entry winning on a shared key.
 * @typedef {Object.<string, TMEntry>} TM
 */

/**
 * A worklist item: one string and the languages it is missing from.
 * @typedef {Object} WorklistItem
 * @property {string} srcHash           Key.
 * @property {string} source            Source text.
 * @property {string} [context]         Advisory context.
 * @property {'text'|'html'|'markdown'} format  Format.
 * @property {Array<[number, number]>} [protected]  The unit's protected spans, when it has them.
 * @property {string[]} missing         Target languages where the translation is absent.
 */

/**
 * The worklist produced by the gate.
 * @typedef {Object} Worklist
 * @property {'up-to-date'|'work'} status
 * @property {string[]} [targets]       Target languages evaluated (only when status=work).
 * @property {WorklistItem[]} [items]   Strings with missing languages (only when status=work).
 * @property {string[]} [orphans]       TM keys with no matching unit (garbage-collection candidates).
 */

/**
 * A job-log entry for one translated string.
 * @typedef {Object} JobItem
 * @property {string} srcHash
 * @property {string} lang
 * @property {string} source
 * @property {string} text
 * @property {'machine'} status
 * @property {string} [model]
 * @property {number} [attempt]  The request, counted per segment, that produced it.
 * @property {number} [tokens]
 */

/**
 * A failure recorded in the job log.
 * @typedef {Object} JobFailure
 * @property {string} srcHash
 * @property {string} lang
 * @property {string} error
 * @property {number} [attempt]
 */

/**
 * A job log (committed — it is the audit trail of what was translated when).
 * @typedef {Object} JobLog
 * @property {string} id
 * @property {string} at
 * @property {string} [trigger]
 * @property {string[]} [languages_added]
 * @property {JobItem[]} items
 * @property {JobFailure[]} failures
 * @property {Array<{srcHash:string, lang:string, error:string}>} [exhausted]  Segments at the attempt limit, which stay untranslated.
 * @property {JobDropped[]} [dropped]  Identifiers replies returned that their requests did not ask for, each dropped.
 * @property {'ok'|'partial'|'failed'} result
 */

/**
 * An identifier a reply returned that its request did not ask for: dropped, never written and never queued.
 * @typedef {Object} JobDropped
 * @property {string} id        The identifier as the reply wrote it.
 * @property {string} lang
 * @property {string} page      The request's page.
 * @property {string|null} section  The request's section, or null for a whole page.
 */

/**
 * One segment of a page, as an adapter's `pages()` view lists it.
 * @typedef {Object} PageSegment
 * @property {string} key       The unit's key (`keyOf` of its source).
 * @property {string} source    The source text, as the catalogue holds it.
 * @property {'text'|'html'|'markdown'} format
 * @property {string} [context] Advisory context. `"heading"` (`HEADING_CONTEXT` in `requests.mjs`) marks a
 *                              heading, which a split page's outline lists under its section.
 * @property {Array<[number, number]>} [protected]  Protected spans, relative to `source`.
 * @property {string} section   The top-level section holding it; the adapter defines a page's sections.
 */

/**
 * A page: the unit one request translates, unless it is split into sections.
 * @typedef {Object} Page
 * @property {string} id                 The page's label (a content file's, the UI dictionary's, a Markdown path).
 * @property {PageSegment[]} segments    In document order.
 */

/**
 * One entry of a split page's outline: a section, in page order, with the text of
 * the headings the page view gives it, when it has any.
 * @typedef {Object} OutlineEntry
 * @property {string} section
 * @property {string[]} [headings]
 */

/**
 * A planned request: one page, or one section of it, into one locale.
 * @typedef {Object} RequestSpec
 * @property {string} page
 * @property {string|null} section        Null when the request carries the whole page.
 * @property {string} lang
 * @property {OutlineEntry[]} [outline]   For a section request: every section of the page, in order.
 * @property {Array<{id:string, format:string, context?:string, source:string, translation?:string}>} segments
 *           The context, in order: the whole page, or for a section request its section and the sections
 *           immediately before and after it. On a first request (`attempt` 1) a segment the request does not
 *           ask for carries its existing translation; on a resubmission none does.
 * @property {string[]} requested         The identifiers to translate, in page order.
 * @property {Object.<string,string[]>} [keep]  Requested Markdown identifier → the strings its protected spans hold.
 * @property {Array<{srcHash:string, source:string, format:string, context?:string, protected?:Array<[number,number]>}>} items
 *           The requested units, as the catalogue holds them.
 * @property {number} attempt             The request's attempt, counted per segment.
 * @property {boolean} fallback           Whether it is a refusal's resubmission on the fallback model.
 * @property {Object.<string,string>} corrections  Identifier → the defect its earlier translation had, for a defect of that segment alone.
 * @property {string[]} [replyCorrections]  Each distinct defect an earlier reply had as a whole, stated once for the request.
 */

/**
 * The resubmission queue: per locale, per unit, the attempts made and the defect
 * the next request states; `whole` marks a defect of the whole reply.
 * @typedef {Object.<string, Object.<string, {attempts:number, defect:string, whole?:boolean, fallback?:boolean, usedFallback?:boolean}>>} Queue
 */

/**
 * The pending file, `<memory.dir>/pending.json`.
 * @typedef {Object} PendingFile
 * @property {Array<{id:string, createdAt:string, requests:Object.<string,{page:string, section:string|null, lang:string, ids:string[], attempt:number, model:string, fallback:boolean}>}>} batches
 *           The batches `submit` created that `collect` has not cleared, each with its custom-identifier mapping.
 * @property {Queue} queue
 */

export default { LAYER, STATUS, RESULT, FORMAT };
