/**
 * validate.mjs — The one validation of a translation reply, applied by both
 * transports before anything reaches the memory.
 *
 * READS nothing and WRITES nothing: a pure function over a request's requested
 * units and the reply's entries.
 *
 * A reply is checked against the request that produced it:
 *   - THE IDENTIFIER SET. An identifier the request did not ask for is dropped
 *     and returned as `dropped`, for the caller to log; it rejects nothing, and
 *     each requested segment is still checked on its own. An identifier returned
 *     more than once with the same text each time — a page that holds one text
 *     twice lists it twice in the context — is checked once like any other; one
 *     returned with different texts rejects that segment alone. An omitted
 *     identifier rejects that segment.
 *   - THE WHOLE REPLY is rejected only when it carries no entries at all; that
 *     defect is returned as `replyDefect`, so the caller states it once.
 *   - PER SEGMENT, against the unit's own source:
 *       - an empty translation of a non-empty source;
 *       - UTF-8 text decoded in a single-byte code page (`doubleEncodedSequences`)
 *         that the source does not hold;
 *       - HTML tags and comments — generated-section markers among them — that
 *         differ from the source's, as a multiset; and, for an `html` unit whose
 *         source is balanced, a translation that is not;
 *       - for a `markdown` unit, a protected span the unit stores (inline code,
 *         a link or image destination, inline HTML, a reference, a character
 *         reference) that the translation no longer contains, and any protected
 *         span the translation adds or alters, comparing the source slice and
 *         the translation each parsed on its own;
 *       - a do-not-translate term the source contains, in the casing it
 *         occurs with, that the translation drops. A term is found in the
 *         source in any casing by default, and only as written when the
 *         caller passes `caseSensitive`, which it reads from the glossary
 *         through `doNotTranslateOf` (`translator-prompt.mjs`), the reading
 *         rule 1 of the instructions states; an entry `{ term, caseSensitive }`
 *         (`doNotTranslateOf(glossary).entries`) is matched in its own mode.
 *         In either mode a term written
 *         in Latin letters matches where no Latin letter or digit stands
 *         directly before or after it, a letter of another script included
 *         (`Aggrega의`), and any other term where no letter or digit does.
 * A rejected segment is never written; its defect is the text stated to the
 * model in the segment's next request.
 */

import { isBalancedHtml } from './translator-prompt.mjs';
import { standaloneProtectedTexts } from './adapters/markdown/segment.mjs';

/** HTML comments (generated-section markers included) and tags, as written. */
const MARKUP_RE = /<!--[\s\S]*?-->|<\/?[A-Za-z][^<>]*>/g;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Elements of `expected` absent from `actual`, and of `actual` absent from `expected`, as multisets. */
function multisetDifference(expected, actual) {
  const counts = new Map();
  for (const x of expected) counts.set(x, (counts.get(x) || 0) + 1);
  const extra = [];
  for (const x of actual) {
    const n = counts.get(x) || 0;
    if (n > 0) counts.set(x, n - 1);
    else extra.push(x);
  }
  const missing = [];
  for (const [x, n] of counts) for (let i = 0; i < n; i++) missing.push(x);
  return { missing, extra };
}

/** Non-overlapping occurrences of `needle` in `haystack`. */
function occurrences(haystack, needle) {
  let count = 0;
  for (let at = haystack.indexOf(needle); needle && at !== -1; at = haystack.indexOf(needle, at + needle.length)) count++;
  return count;
}

const quoteAll = (list) => list.map((x) => JSON.stringify(x)).join(', ');

/** The markup defect of a segment, or null. */
function markupDefect(item, text) {
  const { missing, extra } = multisetDifference(item.source.match(MARKUP_RE) || [], text.match(MARKUP_RE) || []);
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`missing ${quoteAll(missing)}`);
    if (extra.length) parts.push(`added ${quoteAll(extra)}`);
    return `HTML tags or comments differ from the source: ${parts.join('; ')}`;
  }
  if (item.format === 'html' && isBalancedHtml(item.source) && !isBalancedHtml(text)) {
    return 'the HTML tags are no longer balanced as in the source';
  }
  return null;
}

/** The protected-span defect of a Markdown segment, or null. */
function markdownDefect(item, text) {
  const stored = (item.protected || []).map(([start, end]) => item.source.slice(start, end));
  const required = new Map();
  for (const span of stored) required.set(span, (required.get(span) || 0) + 1);
  const missing = [];
  for (const [span, n] of required) if (occurrences(text, span) < n) missing.push(span);
  let standalone;
  try {
    standalone = multisetDifference(standaloneProtectedTexts(item.source), standaloneProtectedTexts(text));
  } catch (err) {
    return `the translation's Markdown does not parse as the source's does: ${(err && err.message) || err}`;
  }
  const lost = [...new Set([...missing, ...standalone.missing])];
  if (lost.length || standalone.extra.length) {
    const parts = [];
    if (lost.length) parts.push(`missing or altered ${quoteAll(lost)}`);
    if (standalone.extra.length) parts.push(`added ${quoteAll(standalone.extra)}`);
    return `inline code, a link or image destination, HTML or a reference differs from the source: ${parts.join('; ')}`;
  }
  return null;
}

/** A term written in Latin letters: at least one Latin letter, and no letter of another script. */
const LATIN_TERM_RE = /^(?=.*\p{Script=Latin})[\p{Script=Latin}\P{L}]*$/su;

/**
 * The characters a do-not-translate term may not continue into, on either side:
 * the boundary applies within the term's own script. A term written in Latin
 * letters is bounded by a Latin letter or a digit, so `Componentize` holds no
 * `Component`, while `Component를`, `Componentを` and `Component的` do, a
 * particle or a word of another script standing directly against it. Any other
 * term is bounded by a letter or a digit of any script. Rule 1 of the general
 * rules (`translator-prompt.mjs`) states the same boundary to the model.
 */
const termEdge = (term) => (LATIN_TERM_RE.test(term) ? '[\\p{Script=Latin}\\p{N}]' : '[\\p{L}\\p{N}]');

/**
 * The byte each character of a single-byte code page stands for, for the bytes
 * 0x80 to 0xFF, merged over the code pages UTF-8 text is most often mis-decoded
 * through: Windows-1252, Windows-1250 and ISO-8859-1 (the last read by code
 * point, since the platform decoder reads `iso-8859-1` as Windows-1252). A
 * character two code pages give different bytes keeps each code page's own map.
 */
const CODE_PAGE_MAPS = (() => {
  const maps = [];
  for (const label of ['windows-1252', 'windows-1250']) {
    const decoder = new TextDecoder(label);
    const map = new Map();
    for (let byte = 0x80; byte <= 0xff; byte++) map.set(decoder.decode(Uint8Array.of(byte)), byte);
    maps.push(map);
  }
  const latin1 = new Map();
  for (let byte = 0x80; byte <= 0xff; byte++) latin1.set(String.fromCharCode(byte), byte);
  maps.push(latin1);
  return maps;
})();

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Whether the bytes form one UTF-8 character of the kinds double encoding
 * produces in translated prose: a Latin letter or sign from U+0080 to U+017F
 * (two bytes, lead 0xC2 to 0xC5), general punctuation, a currency or letterlike
 * sign from U+2000 to U+21BF (three bytes, lead 0xE2), or a CJK, kana or Hangul
 * character from U+3000 to U+9FFF (three bytes, lead 0xE3 to 0xE9). A sequence
 * holding 0xA0, the no-break space, is never one: an accented capital or a
 * letter followed by a no-break space and a guillemet, as French typography
 * writes « CAFÉ », reads as such bytes in a single-byte code page.
 */
function isDoubleEncoded(bytes) {
  if (bytes.slice(1).some((b) => b < 0x80 || b > 0xbf || b === 0xa0)) return false;
  const [lead, second] = bytes;
  if (bytes.length === 2 && !(lead >= 0xc2 && lead <= 0xc5)) return false;
  if (bytes.length === 3 && !((lead === 0xe2 && second <= 0x86) || (lead >= 0xe3 && lead <= 0xe9))) return false;
  try {
    return [...UTF8.decode(Uint8Array.from(bytes))].length === 1;
  } catch {
    return false;
  }
}

/**
 * The double-encoded UTF-8 sequences a text holds: each run of two or three
 * characters that, read back as the bytes of one single-byte code page
 * (`CODE_PAGE_MAPS`), is one UTF-8 character (`isDoubleEncoded`) — `Ã©` for `é`,
 * `â€”` for `—`, `Ă¤` for `ä`. Distinct, in order of first occurrence.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function doubleEncodedSequences(text) {
  const found = [];
  const chars = [...(typeof text === 'string' ? text : '')];
  for (const map of CODE_PAGE_MAPS) {
    for (let i = 0; i < chars.length; i++) {
      for (const length of [3, 2]) {
        const run = chars.slice(i, i + length);
        if (run.length !== length || !run.every((c) => map.has(c))) continue;
        if (!isDoubleEncoded(run.map((c) => map.get(c)))) continue;
        const sequence = run.join('');
        if (!found.includes(sequence)) found.push(sequence);
        i += length - 1;
        break;
      }
    }
  }
  return found;
}

/** The double-encoding defect of a segment: sequences its translation holds and its source does not; or null. */
function doubleEncodingDefect(item, text) {
  const added = doubleEncodedSequences(text).filter((sequence) => !item.source.includes(sequence));
  return added.length
    ? `the translation holds UTF-8 text decoded in a single-byte code page (${quoteAll(added)}); write each character as itself`
    : null;
}

/** The do-not-translate defect of a segment, or null. */
function doNotTranslateDefect(item, text, terms, caseSensitive) {
  const dropped = [];
  for (const entry of terms) {
    // An entry is a term, matched in the list's mode, or `{ term, caseSensitive }` (`doNotTranslateOf(glossary).entries`).
    const term = typeof entry === 'string' ? entry : entry && entry.term;
    const sensitive = typeof entry === 'string' ? caseSensitive : Boolean(entry && entry.caseSensitive);
    if (typeof term !== 'string' || !term) continue;
    const edge = termEdge(term);
    const bounded = (s, flags) => new RegExp(`(?<!${edge})${escapeRegExp(s)}(?!${edge})`, flags);
    for (const occurrence of new Set(item.source.match(bounded(term, sensitive ? 'gu' : 'giu')) || [])) {
      if (!bounded(occurrence, 'u').test(text)) dropped.push(occurrence);
    }
  }
  return dropped.length ? `the do-not-translate term ${quoteAll(dropped)} is missing; keep it verbatim` : null;
}

/**
 * The defect of one translated segment against its unit, or null when it passes.
 *
 * @param {{source:string, format?:string, protected?:Array<[number,number]>}} item
 * @param {string} text
 * @param {Array<string|{term:string, caseSensitive:boolean}>} [doNotTranslate]  terms, or entries with their own mode.
 * @param {{caseSensitive?: boolean}} [options]  `caseSensitive`: find each plain term in the source only as written.
 * @returns {string|null}
 */
export function segmentDefect(item, text, doNotTranslate = [], { caseSensitive = false } = {}) {
  if (typeof text !== 'string' || (text.trim() === '' && item.source.trim() !== '')) return 'the translation is empty';
  return (
    doubleEncodingDefect(item, text) ||
    markupDefect(item, text) ||
    (item.format === 'markdown' ? markdownDefect(item, text) : null) ||
    doNotTranslateDefect(item, text, doNotTranslate, caseSensitive)
  );
}

/**
 * Validates a reply against the request that produced it.
 *
 * @param {Object} args
 * @param {Array<{srcHash:string, source:string, format?:string, protected?:Array<[number,number]>}>} args.items
 *        the requested units, in request order.
 * @param {Array<{id:string, text:string}>|null} args.entries  the reply's entries, or null when it had none.
 * @param {string} [args.replyDefect]       why the reply had no entries.
 * @param {Array<string|{term:string, caseSensitive:boolean}>} [args.doNotTranslate]  the glossary's do-not-translate
 *        terms (`doNotTranslateOf(glossary).terms`), or its entries with their own modes (`.entries`).
 * @param {boolean} [args.caseSensitive]    whether they match only as written (`doNotTranslateOf(glossary).caseSensitive`).
 * @returns {{accepted: Object.<string,string>, rejected: Object.<string,string>, dropped: string[], replyDefect?: string}}
 *          identifier → translation, and identifier → defect, every requested identifier in exactly one;
 *          the identifiers the reply returned that the request did not ask for, each once, in reply order;
 *          and, only when every segment was rejected for one defect of the whole reply, that defect.
 */
export function validateTranslations({ items, entries, replyDefect, doNotTranslate = [], caseSensitive = false }) {
  const accepted = {};
  const rejected = {};
  const dropped = [];
  const rejectAll = (defect) => {
    for (const item of items) rejected[item.srcHash] = defect;
    return { accepted: {}, rejected, dropped, replyDefect: defect };
  };
  if (!Array.isArray(entries)) return rejectAll(replyDefect || 'the reply carried no translations');

  const requested = new Set(items.map((item) => item.srcHash));
  const texts = new Map();
  for (const entry of entries) {
    if (!requested.has(entry.id)) {
      if (!dropped.includes(entry.id)) dropped.push(entry.id);
    } else if (texts.has(entry.id)) texts.get(entry.id).push(entry.text);
    else texts.set(entry.id, [entry.text]);
  }
  for (const item of items) {
    if (!texts.has(item.srcHash)) {
      rejected[item.srcHash] = 'no translation was returned for this identifier';
      continue;
    }
    const returned = texts.get(item.srcHash);
    if (new Set(returned).size > 1) {
      rejected[item.srcHash] = `this identifier was returned ${returned.length} times with different texts; return it exactly once`;
      continue;
    }
    const text = returned[0];
    const defect = segmentDefect(item, text, doNotTranslate, { caseSensitive });
    if (defect) rejected[item.srcHash] = defect;
    else accepted[item.srcHash] = text;
  }
  return { accepted, rejected, dropped };
}

export default { validateTranslations, segmentDefect, doubleEncodedSequences };
