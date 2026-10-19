/**
 * translator-prompt.mjs — The transport-independent text of the translator: its
 * rules, the glossary's part of the instructions, and the reading of a reply.
 *
 * READS nothing and WRITES nothing: it builds strings and inspects them.
 *
 * This module holds the part of the translator that does not depend on how a
 * request reaches the model, so both transports — the synchronous Messages API
 * and the Message Batches API — share it through the one request builder
 * (`requests.mjs`):
 *   - `generalRules` — the package's rules, the first part of the system prompt;
 *   - `glossaryRules` — the project's glossary, its second part;
 *   - `doNotTranslateOf` — the one reading of the glossary's do-not-translate
 *     terms and of how they are matched, which rule 1, the glossary part and the
 *     validation (`validate.mjs`, through its callers) all use;
 *   - `readTranslationMessage` — the one reading of a Messages API reply: a
 *     refusal, the structured translations, or the defect that makes it neither;
 *   - `isBalancedHtml` — a tag-balance check for `html` segments;
 *   - `isTransient` — classification of transient against permanent errors, for
 *     retry and backoff.
 *
 * The translator rules, in priority order:
 *   1. do-not-translate terms are kept VERBATIM — by default matched
 *      case-insensitively, with the casing of the occurrence preserved; with the
 *      glossary's `do_not_translate_case: "sensitive"`, matched only as written;
 *      a `{ "term", "case" }` entry matches in its own mode, whatever the list's;
 *      in either mode a term in Latin letters is bounded only by a Latin letter
 *      or a digit, so it may stand against a letter of another script;
 *   2. the glossary is applied as TERMINOLOGY (a term→target map), with syntax
 *      and tone left to the model;
 *   3. markup is preserved: for `html`, tags, attributes and entities byte for
 *      byte; for `markdown`, every Markdown marker and every protected span; for
 *      `text`, no markup is introduced;
 *   4. edge whitespace, punctuation, `•` bullets and `|` separators are preserved.
 * The validation of a reply against these rules is `validate.mjs`.
 */

/** Void / self-closing HTML elements: they need no closing tag. */
export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/**
 * Transient / permanent classification. Transient (retryable): an error marked
 * `transient: true`, HTTP 429, HTTP ≥ 500, aborts and timeouts, network errors.
 * Everything else (400/401/403/404, a JSON parse failure, an error marked
 * `transient: false`) is permanent and propagates immediately.
 *
 * @param {*} err
 * @returns {boolean}
 */
export function isTransient(err) {
  if (!err) return false;
  if (err.transient === true) return true;
  if (err.transient === false) return false;
  const status = Number(err.status);
  if (status >= 500 || status === 429) return true;
  if (err.name === 'AbortError') return true;
  const code = err.code;
  return code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ENOTFOUND';
}

/**
 * A simple stack-based tag-balance check: it ignores void and self-closing
 * elements, entities (&…;) and comments (<!-- -->). Returns `false` when a
 * closing tag does not match the last one opened, or when tags are still open
 * at the end of the string.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function isBalancedHtml(html) {
  if (typeof html !== 'string') return false;
  const stack = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const full = m[0];
    const name = m[1].toLowerCase();
    const selfClose = m[2] === '/';
    if (full.startsWith('</')) {
      if (VOID_TAGS.has(name)) continue; // a redundant close of a void element is tolerated
      if (stack.length === 0 || stack[stack.length - 1] !== name) return false;
      stack.pop();
    } else {
      if (selfClose || VOID_TAGS.has(name)) continue;
      stack.push(name);
    }
  }
  return stack.length === 0;
}

/**
 * The English name of a locale code: the glossary's `target_lang_names` entry
 * when the project gives one, else the platform's own name for the code
 * (`Intl.DisplayNames`), else the code itself.
 */
function languageName(code, langNames) {
  if (langNames[code]) return langNames[code];
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    if (name && name !== code) return name;
  } catch {
    /* an unknown or malformed code falls through to the code itself */
  }
  return code;
}

/** The glossary key naming how do-not-translate terms are matched. */
export const DO_NOT_TRANSLATE_CASE_KEY = 'do_not_translate_case';

/** The values `do_not_translate_case` takes; the first is the mode of a glossary without the key. */
export const DO_NOT_TRANSLATE_CASES = Object.freeze(['insensitive', 'sensitive']);

/** The values a do-not-translate entry's own `case` takes, overriding the list's mode for that term. */
export const DO_NOT_TRANSLATE_TERM_CASES = DO_NOT_TRANSLATE_CASES;

/**
 * The do-not-translate terms of a glossary and how they are matched: the one
 * reading of `do_not_translate` and `do_not_translate_case`. Rule 1 of the
 * general rules, the glossary part and the validation of every reply read the
 * glossary through it, so the instruction and the check cannot disagree.
 *
 * Without the key a term matches case-insensitively and each occurrence keeps
 * its own casing. With `"sensitive"` a term matches only where it occurs exactly
 * as the glossary writes it, and the same word in another casing is ordinary
 * text. Any other value is a defect, never read as the default.
 *
 * An entry of `do_not_translate` is a term, or `{ "term", "case" }` whose
 * `case` (`"sensitive"` or `"insensitive"`) decides for that term alone, so a
 * product name written in capitals (`LASTRA`) is kept while the common word
 * (`lastra`) is translated, in a list that otherwise matches in any casing. A
 * malformed entry object is a defect, named by its position; any other value
 * that is not a string is ignored, as it always was.
 *
 * @param {Object} [glossary]
 * @returns {{terms: string[], caseSensitive: boolean, entries: Array<{term: string, caseSensitive: boolean, own: boolean}>}}
 *          the terms as written, the list's mode, and each term with the mode it is matched in
 *          (`own` when its entry states it).
 * @throws {Error} when `do_not_translate_case` is present and is not one of `DO_NOT_TRANSLATE_CASES`,
 *         or an entry object is not `{ "term": string, "case"?: … }`, the message naming the key and the value.
 */
export function doNotTranslateOf(glossary = {}) {
  const value = glossary && glossary[DO_NOT_TRANSLATE_CASE_KEY];
  if (value !== undefined && !DO_NOT_TRANSLATE_CASES.includes(value)) {
    throw new Error(
      `the glossary's "${DO_NOT_TRANSLATE_CASE_KEY}" is ${JSON.stringify(value)}; ` +
        `it is ${DO_NOT_TRANSLATE_CASES.map((mode) => `"${mode}"`).join(' or ')}, and without it terms match case-insensitively.`
    );
  }
  const listed = glossary && Array.isArray(glossary.do_not_translate) ? glossary.do_not_translate : [];
  const caseSensitive = value === 'sensitive';
  const entries = [];
  listed.forEach((entry, index) => {
    if (typeof entry === 'string') {
      if (entry) entries.push({ term: entry, caseSensitive, own: false });
      return;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const keys = Object.keys(entry);
    const valid =
      typeof entry.term === 'string' &&
      entry.term !== '' &&
      keys.every((k) => k === 'term' || k === 'case') &&
      (entry.case === undefined || DO_NOT_TRANSLATE_TERM_CASES.includes(entry.case));
    if (!valid) {
      throw new Error(
        `the glossary's "do_not_translate" entry ${index} is ${JSON.stringify(entry)}; an entry is a term, or ` +
          `{ "term": string, "case": ${DO_NOT_TRANSLATE_TERM_CASES.map((mode) => `"${mode}"`).join(' | ')} }.`
      );
    }
    entries.push(
      entry.case === undefined
        ? { term: entry.term, caseSensitive, own: false }
        : { term: entry.term, caseSensitive: entry.case === 'sensitive', own: entry.case === 'sensitive' ? !caseSensitive : caseSensitive }
    );
  });
  return { terms: entries.map((e) => e.term), caseSensitive, entries };
}

/** The mark the glossary section puts after a term matched otherwise than the list. */
const termMark = (entry) => (entry.own ? (entry.caseSensitive ? ' (exact case)' : ' (any case)') : '');

/** Rule 1's sentence on the terms marked as exceptions to the list's mode, or '' when none is. */
function exceptionSentence(entries, caseSensitive) {
  if (!entries.some((e) => e.own)) return '';
  return caseSensitive
    ? ' A term the glossary section marks "(any case)" is the exception: it matches CASE-INSENSITIVELY, and each occurrence keeps its own casing.'
    : ' A term the glossary section marks "(exact case)" is the exception: it matches only where it occurs exactly as written, capital letters included, and the same word in any other casing is ordinary text, which you translate like the rest of the sentence.';
}

/** Rule 1's sentence on matching, for the mode in force. */
function matchingSentence(caseSensitive) {
  return caseSensitive
    ? 'Match them CASE-SENSITIVELY: a term matches only where it occurs exactly as the glossary section writes it, capital letters included; the same word in any other casing is ordinary text, and you translate it like the rest of the sentence.'
    : 'Match them CASE-INSENSITIVELY, but PRESERVE THE CASING OF THE OCCURRENCE exactly as it appears in the source (do not upper-case or lower-case them).';
}

/**
 * Rule 1's sentence on where a term begins and ends, in either mode: the
 * boundary the validation (`validate.mjs`) applies, within the term's own script.
 */
const BOUNDARY_SENTENCE =
  'A term written in Latin letters is an occurrence only where no Latin letter or digit stands directly before or after it, so a longer word that contains it, such as its plural, is not that term; it may stand directly against Hangul, kana, CJK or any other script, so a particle or word attached in the target script keeps the term (for example "Acme의" or "Acmeの" for a term "Acme").';

/**
 * The package's general rules: the first block of the system prompt. It names
 * the source and target languages, describes the request and reply shapes, and
 * states the four rules in priority order, rule 1 stating how the glossary's
 * do-not-translate terms are matched (`doNotTranslateOf`) and where a term
 * begins and ends. It depends only on
 * the locale pair and the glossary's language names and matching mode, so it is
 * byte-identical for every page of one locale.
 *
 * @param {Object} args
 * @param {string} args.lang        the target locale.
 * @param {string} args.sourceLang  the catalogue's source locale; required, never assumed.
 * @param {Object} [args.glossary]
 * @returns {string}
 */
export function generalRules({ lang, sourceLang, glossary = {} }) {
  if (typeof sourceLang !== 'string' || sourceLang === '') {
    throw new Error('generalRules: sourceLang is required');
  }
  const langNames = (glossary && glossary.target_lang_names) || {};
  const target = languageName(lang, langNames);
  const source = languageName(sourceLang, langNames);
  const { caseSensitive, entries } = doNotTranslateOf(glossary);
  return [
    `You translate pages from ${source} into ${target}.`,
    '',
    'Each user message is about one page and has two parts, each a JSON object. The first part is the context:',
    '{ "page": string, "outline"?: [{ "section": string, "headings"?: string[] }], "segments": [{ "id": string, "format": "text"|"html"|"markdown", "context"?: string, "source": string, "translation"?: string }] }',
    'The second part is what this request asks for. For a long page it names the one "section" to translate:',
    '{ "section"?: string, "translate": string[], "keep"?: { [id]: string[] }, "corrections"?: { [id]: string }, "replyCorrections"?: string[] }',
    '- "segments" is source text in reading order: the whole page, or for a long page the section to translate and the sections immediately before and after it. A segment that carries "translation" is already translated: it is fixed context, so keep your wording consistent with it, and never change it or return it.',
    '- "outline", given for a long page, lists every section of the page in order, with the text of its headings, so you can see where the given sections sit in the page.',
    '- "translate" lists the identifiers to translate. Translate the "source" of each, using the rest of the context.',
    '- "context", when present, is advisory: it says where the segment sits. Never translate it and never return it.',
    '- "keep", when present, gives for an identifier to translate the strings rule 3 keeps byte-for-byte in it.',
    '- "corrections", when present, states what was wrong with an earlier translation of a segment. Fix exactly that.',
    '- "replyCorrections", when present, states what was wrong with an earlier reply as a whole. Fix exactly that, for every identifier in "translate".',
    '',
    'Apply these rules in STRICT PRIORITY ORDER (a higher-numbered rule never overrides a lower-numbered one):',
    '',
    `1. DO-NOT-TRANSLATE terms. Never translate the terms the glossary section lists; reproduce each one VERBATIM wherever it occurs, including inline inside a longer sentence. ${matchingSentence(caseSensitive)}${exceptionSentence(entries, caseSensitive)} ${BOUNDARY_SENTENCE}`,
    '',
    '2. GLOSSARY (terminology). When a source term the glossary section maps appears, use the given target term for consistency. This governs TERMINOLOGY ONLY — leave sentence structure, syntax, and tone to your judgement as a fluent translator.',
    '',
    '3. MARKUP. For a segment whose "format" is "html", translate ONLY the human-visible text and keep every HTML tag, attribute, and entity byte-for-byte identical (same tag names, same attributes in the same order, same entities such as &nbsp; or &amp;). For a segment whose "format" is "markdown", keep every Markdown marker, and reproduce byte-for-byte identical every string the "keep" list of its identifier names: inline code, link and image destinations, HTML tags and comments, references and character references. For a segment whose "format" is "text", never introduce HTML or Markdown markup.',
    '',
    '4. LITERALS. Preserve leading and trailing whitespace, punctuation, bullet characters ("•"), and pipe separators ("|") exactly as in the source.',
    '',
    `The language guide at the end of these instructions refines register, punctuation and wording for ${target}. It never overrides rules 1 to 4.`,
    '',
    'Reply with the JSON object the output format defines, { "translations": [{ "id": string, "text": string }] }: one entry for each identifier in "translate", each exactly once, and no other.',
  ].join('\n');
}

/**
 * The project's glossary: the second block of the system prompt — the one
 * site-specific sentence (`site_context`), the do-not-translate terms, and the
 * terminology for the target locale.
 *
 * @param {Object} args
 * @param {string} args.lang
 * @param {Object} [args.glossary]
 * @returns {string}
 */
export function glossaryRules({ lang, glossary = {} }) {
  const langNames = (glossary && glossary.target_lang_names) || {};
  const target = languageName(lang, langNames);
  const { entries: dnt } = doNotTranslateOf(glossary);
  const termEntries = Object.entries((glossary.glossary && glossary.glossary[lang]) || {});
  // The one site-specific sentence of the instructions, read from the glossary
  // rather than written here, which keeps this module site-agnostic.
  const siteContext =
    typeof glossary.site_context === 'string' && glossary.site_context.trim()
      ? glossary.site_context.trim()
      : 'You are a professional translator for a company website.';
  return [
    siteContext,
    '',
    'Do-not-translate terms (rule 1):',
    dnt.length ? dnt.map((entry) => `  - "${entry.term}"${termMark(entry)}`).join('\n') : '  (none)',
    '',
    `Terminology for ${target} (rule 2):`,
    termEntries.length ? termEntries.map(([src, tgt]) => `  - "${src}" -> "${tgt}"`).join('\n') : '  (none)',
  ].join('\n');
}

/**
 * Reads a Messages API reply — a `Message` from the synchronous API or from a
 * succeeded batch result — into one of three outcomes:
 *   - `{ refusal: { category } }` when `stop_reason` is `refusal`;
 *   - `{ entries: [{ id, text }] }` when the text is the output format's JSON;
 *   - `{ defect }` otherwise, naming what is wrong (no text, a reply cut off at
 *     `max_tokens`, JSON that does not parse or has another shape).
 * It never throws: a bad reply is a defect stated in the next request.
 *
 * @param {{stop_reason?: string, stop_details?: {category?: string|null}|null, content?: Array<{type:string, text?:string}>}} message
 * @returns {{refusal: {category: string|null}} | {entries: Array<{id:string, text:string}>} | {defect: string}}
 */
export function readTranslationMessage(message) {
  if (message && message.stop_reason === 'refusal') {
    return { refusal: { category: (message.stop_details && message.stop_details.category) || null } };
  }
  const blocks = message && Array.isArray(message.content) ? message.content : [];
  const text = blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  if (message && message.stop_reason === 'max_tokens') {
    return { defect: 'the reply was cut off at max_tokens before its JSON ended' };
  }
  if (!text.trim()) return { defect: 'the reply carried no text' };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { defect: `the reply is not valid JSON (${(err && err.message) || err})` };
  }
  const list = parsed && Array.isArray(parsed.translations) ? parsed.translations : null;
  if (!list || !list.every((e) => e && typeof e.id === 'string' && typeof e.text === 'string')) {
    return { defect: 'the reply is not { "translations": [{ "id": string, "text": string }] }' };
  }
  return { entries: list.map((e) => ({ id: e.id, text: e.text })) };
}

export default { generalRules, glossaryRules, doNotTranslateOf, DO_NOT_TRANSLATE_TERM_CASES, readTranslationMessage, isBalancedHtml, isTransient };
