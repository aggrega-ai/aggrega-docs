/**
 * pending.mjs — The shapes the pending file holds: batch custom identifiers,
 * the recorded batches, and the resubmission queue with its one refusal rule.
 *
 * READS nothing and WRITES nothing: the pending file itself is read and written
 * by the store alone (`readPending` / `writePending` in `store.mjs`). The
 * functions here build and update the values the store persists, and the
 * synchronous transport keeps a queue of the same shape in memory.
 *
 * THE PENDING FILE, `<memory.dir>/pending.json`:
 *   { "batches": [ { "id", "createdAt", "requests": { <custom_id>: { page,
 *       section, lang, ids, attempt, model, fallback } } } ],
 *     "queue": { <lang>: { <srcHash>: { attempts, defect, whole?, fallback?, usedFallback? } } } }
 * A recorded batch is one `submit` created and `collect` has not cleared. The
 * queue holds every segment whose last translation was rejected, refused or not
 * returned: its next request states the defect, and a segment whose `attempts`
 * reached the configured limit is not requested again. A defect of the whole
 * reply — one defect queued for every segment of a request — is marked `whole`,
 * so the next request states it once rather than once per segment.
 */

/**
 * The pattern a batch request's `custom_id` must match. Read from the Message
 * Batches API reference the SDK cites for `BatchCreateParams.Request.custom_id`
 * (https://platform.claude.com/docs/en/api/messages/batches/create):
 * "minLength: 1, maxLength: 64, pattern: ^[a-zA-Z0-9_-]{1,64}$". The installed
 * SDK's type declares the field as a plain `string` and states only that it
 * "Must be unique for each request within the Message Batch."
 */
export const CUSTOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** The longest custom identifier the pattern admits. */
const CUSTOM_ID_MAX = 64;

/** Every character the pattern does not admit, collapsed to one hyphen. */
const clean = (s) => String(s).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The custom identifier of the request at `index` in a batch. The zero-padded
 * index, unique within the batch, comes first, so cutting the readable rest to
 * the pattern's length can never make two identifiers equal; the locale and the
 * page follow so a result can be read by eye. The mapping from identifier to
 * page, locale and segments lives in the pending file, never in the identifier.
 *
 * @param {Object} args
 * @param {number} args.index    the request's position in the batch.
 * @param {string} args.lang
 * @param {string} args.page
 * @param {string|null} [args.section]
 * @returns {string}
 */
export function customIdFor({ index, lang, page, section = null }) {
  const head = String(index).padStart(6, '0');
  const tail = clean(`${lang}-${page}${section ? `-${section}` : ''}`);
  const id = (tail ? `${head}-${tail}` : head).slice(0, CUSTOM_ID_MAX);
  return id.replace(/-+$/, '') || head;
}

/** The value of a pending file that records nothing. */
export function emptyPending() {
  return { batches: [], queue: {} };
}

/**
 * THE ONE REFUSAL RULE: a refused request is resubmitted once on the fallback
 * model, when the configuration names one and these segments have not used it.
 * Every other refusal is queued for the primary model like any other defect.
 *
 * @param {Object} args
 * @param {string} [args.fallbackId]     the configured `model.fallbackId`.
 * @param {boolean} args.wasFallback     whether the refused request already ran on the fallback.
 * @param {boolean} [args.usedFallback]  whether these segments ran on the fallback before.
 * @returns {boolean} whether the resubmission uses the fallback model.
 */
export function fallsBackAfterRefusal({ fallbackId, wasFallback, usedFallback = false }) {
  return Boolean(fallbackId) && !wasFallback && !usedFallback;
}

/**
 * Queues segments for resubmission with the defect their next request states.
 * The attempt count is SET to the attempt that just ran, never incremented, so
 * applying the same outcome twice leaves the queue as applying it once.
 *
 * @param {import('./types.mjs').Queue} queue  updated in place.
 * @param {Object} args
 * @param {string} args.lang
 * @param {string[]} args.ids
 * @param {number} args.attempt         the attempt that produced the defect.
 * @param {string|Object.<string,string>} args.defect  one defect for all, which marks each entry `whole`, or one per identifier.
 * @param {boolean} [args.refusal]      whether the request was refused.
 * @param {boolean} [args.wasFallback]  whether it ran on the fallback model.
 * @param {string} [args.fallbackId]
 */
export function queueDefect(queue, { lang, ids, attempt, defect, refusal = false, wasFallback = false, fallbackId }) {
  if (!queue[lang]) queue[lang] = {};
  for (const id of ids) {
    const before = queue[lang][id] || {};
    const usedFallback = Boolean(before.usedFallback || wasFallback);
    const entry = {
      attempts: Math.max(before.attempts || 0, attempt),
      defect: typeof defect === 'string' ? defect : defect[id],
    };
    if (typeof defect === 'string') entry.whole = true;
    if (refusal && fallsBackAfterRefusal({ fallbackId, wasFallback, usedFallback })) entry.fallback = true;
    if (usedFallback) entry.usedFallback = true;
    queue[lang][id] = entry;
  }
}

/**
 * Removes segments from the queue: their translation was accepted.
 *
 * @param {import('./types.mjs').Queue} queue  updated in place.
 * @param {string} lang
 * @param {string[]} ids
 */
export function clearQueued(queue, lang, ids) {
  if (!queue[lang]) return;
  for (const id of ids) delete queue[lang][id];
  if (Object.keys(queue[lang]).length === 0) delete queue[lang];
}

/** The defect a refusal states, naming its category when the API gives one. */
export function refusalDefect(refusal) {
  const category = refusal && refusal.category;
  return `the model declined the request${category ? ` (refusal category: ${category})` : ''}`;
}

export default {
  CUSTOM_ID_PATTERN,
  customIdFor,
  emptyPending,
  fallsBackAfterRefusal,
  queueDefect,
  clearQueued,
  refusalDefect,
};
