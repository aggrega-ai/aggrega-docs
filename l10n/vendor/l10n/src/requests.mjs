/**
 * requests.mjs — The one request builder: from a project's pages and the gate's
 * worklist to the Messages API parameters both transports send.
 *
 * READS the per-language prompt files, the optional project general prompt
 * file and the glossary, through `loadLanguagePrompts`, `loadGeneralPrompt` and
 * `loadGlossary` and nowhere else. Everything else here is a pure function over
 * the structures its caller supplies, and nothing here WRITES or makes a
 * network call.
 *
 * A REQUEST TRANSLATES ONE PAGE INTO ONE LOCALE — a content file, the UI
 * dictionary, or a Markdown file, as the adapter's `pages()` view orders them —
 * or, when the page's estimated source exceeds `sectionTokens`, one top-level
 * section of it (the adapter defines a page's sections), and when that section
 * too exceeds `sectionTokens`, one part of it, cut at its own headings and then
 * between runs of segments (`divideSection`). Its user message is two
 * text blocks, neither carrying a cache marker:
 *   - THE CONTEXT: the source segments the request is given, in order, with
 *     their identifiers and formats. For a page within `sectionTokens` that is
 *     the whole page. For a split page it is the requested section and the
 *     sections immediately before and after it, together with the page's
 *     OUTLINE, and no other text of the page. The outline is one entry per
 *     section in order, each with its label and the text of the headings the
 *     page view gives it (`HEADING_CONTEXT`). On a DIVIDED page — one with a
 *     section divided into parts — the outline lists every top-level section by
 *     its first heading only, and the parts of the request's own top-level
 *     section each with all of its headings (`dividedOutlineOf`). A first request also carries, for
 *     each segment it does not request that the memory already translates, that
 *     translation as fixed context. A RESUBMISSION — a request whose `attempt`
 *     is above 1, that is, one requesting a segment an earlier reply failed —
 *     carries no translation, so its context is a first request's for the same
 *     section, the same outline and segments, without the translations, the
 *     round's accepted ones included.
 *   - THE REQUEST: the section, when the page is split; the identifiers to
 *     translate; for each requested Markdown unit, the strings its protected
 *     spans hold (`keep`); for a resubmitted segment the defect its earlier
 *     translation had (`corrections`); and each distinct defect an earlier reply
 *     had as a whole — no entries, a cut-off or unparseable reply, a failed or
 *     refused request — stated once (`replyCorrections`), never once per segment.
 * A unit missing from a locale is requested once per locale per plan, on the
 * first page in this order that holds it; on any later page it appears with its
 * source and neither a request nor a translation, since none exists yet. Each
 * returned segment is stored under its own source hash, so the memory stays
 * paragraph-level however the request was shaped.
 *
 * THE SYSTEM PROMPT is text blocks in this order: the package's general rules,
 * the project's glossary, the project's general prompt `<promptsDir>/_general.md`
 * when the project keeps one, and the per-language prompt file
 * `<promptsDir>/<locale>.md` — four blocks with the general prompt, three
 * without it. The last carries `cache_control` with the one-hour duration, so the
 * whole system prompt is a cache prefix; it depends only on the locale, so it is
 * byte-identical for every request of one locale, and it is the only block of a
 * request that carries a cache marker. Without the general prompt file the other
 * three blocks are the same bytes they are with it.
 *
 * THE REPLY is requested through `output_config.format` with ONE fixed schema
 * (`OUTPUT_SCHEMA`) for every request. Structured outputs require
 * `additionalProperties: false` on every object, so a map keyed by identifier
 * cannot be expressed; the identifier set is checked by `validate.mjs` instead.
 * `effort` comes from the configuration unchanged, and so does `thinking` on a
 * request to the primary model; a request resubmitted on the fallback model
 * carries no `thinking`. A request's `max_tokens` reserves the reasoning
 * allowance only when the thinking setting it carries lets the model reason
 * (`outputCeiling`, `buildMessageParams`).
 */

import nodeFs from 'node:fs';
import path from 'node:path';

import { ConfigError } from './config.mjs';
import { estimateTokens, outputCeiling } from './tokens.mjs';
import { doNotTranslateOf, generalRules, glossaryRules } from './translator-prompt.mjs';

/**
 * The cache marker on the system prompt's last block, the one cache marker a
 * request carries: the one-hour duration. The system prompt is shared by every
 * request of a locale; the user message of one request is shared by no other.
 */
export const SYSTEM_CACHE_CONTROL = Object.freeze({ type: 'ephemeral', ttl: '1h' });

/**
 * The `context` an adapter's page view gives a heading segment. A split page's
 * outline lists the text of every such segment under its section; the Markdown
 * adapter gives each segment its kind as its context, so its headings carry it.
 */
export const HEADING_CONTEXT = 'heading';

/**
 * The file name of the project's optional general prompt, in the prompts
 * directory beside the per-language files. The leading underscore keeps it apart
 * from every locale code.
 */
export const GENERAL_PROMPT_FILE = '_general.md';

/** The one structured-output schema every request carries. */
export const OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    translations: Object.freeze({
      type: 'array',
      items: Object.freeze({
        type: 'object',
        properties: Object.freeze({ id: Object.freeze({ type: 'string' }), text: Object.freeze({ type: 'string' }) }),
        required: Object.freeze(['id', 'text']),
        additionalProperties: false,
      }),
    }),
  }),
  required: Object.freeze(['translations']),
  additionalProperties: false,
});

/**
 * Reads the per-language prompt file of every target locale. A missing or empty
 * file is a configuration defect: it throws a ConfigError naming the file.
 *
 * @param {Object} args
 * @param {string} args.promptsDir     the absolute directory of the prompt files.
 * @param {string[]} args.targets      the target locales.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {Object.<string, string>}  locale → the file's text.
 */
export function loadLanguagePrompts({ promptsDir, targets, fsImpl = nodeFs }) {
  const prompts = {};
  for (const lang of targets) {
    const file = path.join(promptsDir, `${lang}.md`);
    if (!fsImpl.existsSync(file)) {
      throw new ConfigError(`${file}: the per-language prompt file for "${lang}" is missing; every target locale needs one.`);
    }
    const text = fsImpl.readFileSync(file, 'utf8');
    if (!text.trim()) throw new ConfigError(`${file}: the per-language prompt file for "${lang}" is empty.`);
    prompts[lang] = text;
  }
  return prompts;
}

/**
 * Reads the project's general prompt file, `<promptsDir>/_general.md`: the
 * instructions a project gives for every target locale. The file is optional:
 * absent, it returns null. Present but empty, it is a configuration defect, and
 * it throws a ConfigError naming the file.
 *
 * @param {Object} args
 * @param {string} args.promptsDir     the absolute directory of the prompt files.
 * @param {typeof nodeFs} [args.fsImpl]
 * @returns {string|null}  the file's text, or null when the file is absent.
 */
export function loadGeneralPrompt({ promptsDir, fsImpl = nodeFs }) {
  const file = path.join(promptsDir, GENERAL_PROMPT_FILE);
  if (!fsImpl.existsSync(file)) return null;
  const text = fsImpl.readFileSync(file, 'utf8');
  if (!text.trim()) {
    throw new ConfigError(`${file}: the general prompt file is empty; give it the project's instructions, or remove it.`);
  }
  return text;
}

/**
 * Loads the glossary, or `{}` when none is configured or the file is absent or
 * unreadable. An absent glossary is a working configuration — no
 * do-not-translate terms, no terminology — so it degrades rather than failing.
 * A glossary whose `do_not_translate_case` is not a matching mode
 * (`doNotTranslateOf`) is a defect a person can fix, and silently matching
 * case-insensitively instead would hide it: it throws a ConfigError naming the
 * file and the key.
 *
 * @param {string|null} file   the glossary's absolute path, or null when the configuration names none.
 * @param {typeof nodeFs} [fsImpl]
 * @returns {Object}
 */
export function loadGlossary(file, fsImpl = nodeFs) {
  if (!file) return {};
  let glossary = {};
  try {
    if (fsImpl.existsSync(file)) {
      const raw = fsImpl.readFileSync(file, 'utf8');
      if (raw && raw.trim()) glossary = JSON.parse(raw);
    }
  } catch {
    /* absent or unreadable glossary → no glossary */
  }
  try {
    doNotTranslateOf(glossary);
  } catch (err) {
    throw new ConfigError(`${file}: ${err.message}`);
  }
  return glossary;
}

/**
 * The system prompt of a locale: the general rules, the glossary, the
 * project's general prompt when there is one, then the per-language prompt, the
 * last block marked for caching with the one-hour duration.
 *
 * @param {Object} args
 * @param {string} args.lang
 * @param {string} args.sourceLang
 * @param {Object} [args.glossary]
 * @param {string|null} [args.generalPrompt]  the text of `<promptsDir>/_general.md`, or null without one.
 * @param {string} args.languagePrompt  the text of `<promptsDir>/<lang>.md`.
 * @returns {Array<{type:'text', text:string, cache_control?:{type:'ephemeral', ttl:'1h'}}>}
 */
export function buildSystem({ lang, sourceLang, glossary = {}, generalPrompt = null, languagePrompt }) {
  if (typeof languagePrompt !== 'string' || !languagePrompt.trim()) {
    throw new Error(`buildSystem: no per-language prompt for "${lang}"`);
  }
  if (generalPrompt !== null && (typeof generalPrompt !== 'string' || !generalPrompt.trim())) {
    throw new Error('buildSystem: the general prompt, when given, must be non-empty text');
  }
  return [
    { type: 'text', text: generalRules({ lang, sourceLang, glossary }) },
    { type: 'text', text: glossaryRules({ lang, glossary }) },
    ...(generalPrompt !== null ? [{ type: 'text', text: generalPrompt }] : []),
    { type: 'text', text: languagePrompt, cache_control: { ...SYSTEM_CACHE_CONTROL } },
  ];
}

/**
 * The pages of a catalogue, for an adapter with no `pages()` view: one page per
 * usage file, in order of first appearance over the catalogue's sorted keys,
 * each unit once per usage, all in one section. A unit with no usage is on no
 * page.
 *
 * @param {import('./types.mjs').SourceCatalog} catalog
 * @returns {import('./types.mjs').Page[]}
 */
export function pagesFromCatalog(catalog) {
  const units = (catalog && catalog.units) || {};
  const byFile = new Map();
  for (const key of Object.keys(units).sort()) {
    const unit = units[key];
    for (const usage of unit.usages || []) {
      if (!byFile.has(usage.file)) byFile.set(usage.file, []);
      byFile.get(usage.file).push({
        key,
        source: unit.source,
        format: unit.format || 'text',
        ...(unit.context ? { context: unit.context } : {}),
        ...(unit.protected ? { protected: unit.protected } : {}),
        section: '',
      });
    }
  }
  return [...byFile].map(([id, segments]) => ({ id, segments }));
}

/** The estimated source tokens of a run of segments. */
const sizeOf = (segments) => segments.reduce((n, s) => n + estimateTokens(s.source), 0);

/**
 * Consecutive blocks of segments, in order, packed into parts of at most
 * `budget` estimated tokens; a block above the budget is a part of its own.
 */
function pack(blocks, budget) {
  const parts = [];
  let current = [];
  for (const block of blocks) {
    if (current.length && sizeOf(current) + sizeOf(block) > budget) {
      parts.push(current);
      current = [];
    }
    current = current.concat(block);
  }
  if (current.length) parts.push(current);
  return parts;
}

/**
 * A section above `sectionTokens`, divided into parts of at most that size: at
 * its own headings first (each heading segment, `HEADING_CONTEXT`, starts a
 * block), and a block still above the size into runs of consecutive segments,
 * the blocks packed in order. A single segment above the size stays one part.
 * Each part is a section of its own, labelled `<section> (part k of n)`; a
 * section within the size is returned as it is.
 */
function divideSection(group, sectionTokens) {
  if (sizeOf(group.segments) <= sectionTokens) return [{ ...group, top: group.section }];
  const atHeadings = [];
  for (const segment of group.segments) {
    const last = atHeadings[atHeadings.length - 1];
    if (last && segment.context !== HEADING_CONTEXT) last.push(segment);
    else atHeadings.push([segment]);
  }
  const blocks = atHeadings.flatMap((block) => (sizeOf(block) > sectionTokens ? block.map((segment) => [segment]) : [block]));
  const parts = pack(blocks, sectionTokens);
  if (parts.length === 1) return [{ ...group, top: group.section }];
  return parts.map((segments, k) => ({ section: `${group.section} (part ${k + 1} of ${parts.length})`, top: group.section, divided: true, segments }));
}

/**
 * The groups of a page's segments one request each translates: the whole page,
 * or its sections when its estimated source exceeds `sectionTokens`, a section
 * itself above that size divided further (`divideSection`). The split bounds
 * what one request translates, and so its `max_tokens`, and what it is given as
 * context: its own group and the groups on either side of it.
 */
function splitPage(page, sectionTokens) {
  if (sizeOf(page.segments) <= sectionTokens) return [{ section: null, top: null, segments: page.segments }];
  const groups = [];
  for (const segment of page.segments) {
    const last = groups[groups.length - 1];
    if (last && last.section === segment.section) last.segments.push(segment);
    else groups.push({ section: segment.section, segments: [segment] });
  }
  return groups.flatMap((group) => divideSection(group, sectionTokens));
}

/**
 * The outline of a split page: one entry per section, in order, with the text of
 * the headings the page view gives that section (`HEADING_CONTEXT`), when it has
 * any. A page view with no heading gives the section labels alone.
 */
function outlineOf(groups) {
  return groups.map((group) => {
    const headings = headingsOf(group);
    return headings.length ? { section: group.section, headings } : { section: group.section };
  });
}

/** The text of the headings the page view gives a group (`HEADING_CONTEXT`), in order. */
const headingsOf = (group) => group.segments.filter((segment) => segment.context === HEADING_CONTEXT).map((segment) => segment.source);

/**
 * The outline of a divided page — one with a section divided into parts — for
 * the request of one group: every top-level section in order by its first
 * heading only, except the request's own top-level section, which lists each of
 * its parts with every heading it holds. A page none of whose sections is
 * divided keeps the whole outline (`outlineOf`) on every request.
 */
function dividedOutlineOf(groups, ownTop) {
  const entries = [];
  const listed = new Set();
  for (const group of groups) {
    if (group.top === ownTop) {
      const headings = headingsOf(group);
      entries.push(headings.length ? { section: group.section, headings } : { section: group.section });
    } else if (!listed.has(group.top)) {
      listed.add(group.top);
      const first = groups.filter((g) => g.top === group.top).flatMap(headingsOf)[0];
      entries.push(first !== undefined ? { section: group.top, headings: [first] } : { section: group.top });
    }
  }
  return entries;
}

/** The distinct substrings a unit's protected spans cover, in order. */
function keepList(item) {
  const seen = new Set();
  const out = [];
  for (const [start, end] of item.protected || []) {
    const text = item.source.slice(start, end);
    if (!seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

/**
 * Plans the requests for the work the gate found. Each request carries its own
 * context (`segments`, and `outline` for a split page), built from its section
 * and its attempt as the module comment states, never from another request's.
 *
 * @param {Object} args
 * @param {import('./types.mjs').Page[]} args.pages      the pages, in their stable order.
 * @param {import('./types.mjs').Worklist} args.worklist the gate's outcome.
 * @param {Object.<string, import('./types.mjs').TM>} args.tmByLang  the lookup view per locale.
 * @param {string[]} args.targets
 * @param {number} args.sectionTokens
 * @param {number} args.attemptLimit
 * @param {import('./types.mjs').Queue} [args.queue]     the resubmission queue.
 * @returns {{specs: import('./types.mjs').RequestSpec[], unplaced: Object.<string,string[]>, exhausted: Object.<string,string[]>}}
 *          the requests in order; per locale, the missing units no page holds, and those at the attempt limit.
 */
export function planRequests({ pages, worklist, tmByLang, targets, sectionTokens, attemptLimit, queue = {} }) {
  const items = new Map();
  const missing = {};
  const exhausted = {};
  for (const lang of targets) {
    missing[lang] = new Set();
    exhausted[lang] = [];
  }
  if (worklist && worklist.status === 'work') {
    for (const item of worklist.items) {
      items.set(item.srcHash, item);
      for (const lang of item.missing) {
        if (!missing[lang]) continue;
        const queued = queue[lang] && queue[lang][item.srcHash];
        if (queued && queued.attempts >= attemptLimit) exhausted[lang].push(item.srcHash);
        else missing[lang].add(item.srcHash);
      }
    }
  }

  const assigned = Object.fromEntries(targets.map((lang) => [lang, new Set()]));
  // One context segment. A unit the plan requests takes its catalogue format, the
  // one its validation applies, and no translation; any other segment the memory
  // translates carries that translation only when `withTranslation` is set.
  const contextSegment = (segment, lang, withTranslation) => {
    const unit = items.get(segment.key);
    const out = { id: segment.key, format: unit ? unit.format || 'text' : segment.format || 'text' };
    if (segment.context) out.context = segment.context;
    out.source = segment.source;
    if (withTranslation) {
      const entry = ((tmByLang && tmByLang[lang]) || {})[segment.key];
      if (!missing[lang].has(segment.key) && entry && typeof entry.text === 'string') out.translation = entry.text;
    }
    return out;
  };
  const specs = [];
  for (const page of pages) {
    const groups = splitPage(page, sectionTokens);
    const split = groups[0].section !== null;
    const divided = groups.some((group) => group.divided);
    const wholeOutline = split && !divided ? outlineOf(groups) : null;
    for (const [index, group] of groups.entries()) {
      const outline = !split ? null : divided ? dividedOutlineOf(groups, group.top) : wholeOutline;
      // A split page's request is given its own section and the groups on either side of it.
      const given = split ? groups.slice(Math.max(0, index - 1), index + 2).flatMap((g) => g.segments) : group.segments;
      for (const lang of targets) {
        const requested = [];
        for (const segment of group.segments) {
          if (missing[lang].has(segment.key) && !assigned[lang].has(segment.key)) {
            assigned[lang].add(segment.key);
            requested.push(segment.key);
          }
        }
        if (requested.length === 0) continue;
        const keep = {};
        for (const id of requested) {
          const item = items.get(id);
          if ((item.format || 'text') !== 'markdown') continue;
          const list = keepList(item);
          if (list.length) keep[id] = list;
        }
        const queued = (queue[lang] || {});
        const corrections = {};
        const replyCorrections = [];
        let previous = 0;
        let fallback = false;
        for (const id of requested) {
          const entry = queued[id];
          if (!entry) continue;
          previous = Math.max(previous, entry.attempts || 0);
          if (entry.defect && entry.whole) {
            if (!replyCorrections.includes(entry.defect)) replyCorrections.push(entry.defect);
          } else if (entry.defect) corrections[id] = entry.defect;
          if (entry.fallback) fallback = true;
        }
        const attempt = previous + 1;
        specs.push({
          page: page.id,
          section: group.section,
          lang,
          ...(outline ? { outline } : {}),
          segments: given.map((segment) => contextSegment(segment, lang, attempt === 1)),
          requested,
          keep,
          items: requested.map((id) => {
            const item = items.get(id);
            return {
              srcHash: id,
              source: item.source,
              format: item.format || 'text',
              ...(item.context !== undefined ? { context: item.context } : {}),
              ...(item.protected !== undefined ? { protected: item.protected } : {}),
            };
          }),
          attempt,
          fallback,
          corrections,
          ...(replyCorrections.length ? { replyCorrections } : {}),
        });
      }
    }
  }

  const unplaced = {};
  for (const lang of targets) unplaced[lang] = [...missing[lang]].filter((key) => !assigned[lang].has(key)).sort();
  return { specs, unplaced, exhausted };
}

/**
 * The user message of a request, as the general rules describe it: two text
 * blocks, each a JSON object, neither carrying a cache marker. The first is the
 * context, `{ page, outline?, segments }`, `outline` only for a split page. The
 * second is what this request asks for: `{ section?, translate, keep?,
 * corrections?, replyCorrections? }`, each of the last three only when non-empty.
 *
 * @param {import('./types.mjs').RequestSpec} spec
 * @returns {Array<{type:'text', text:string}>}
 */
export function buildUserMessage(spec) {
  const context = { page: spec.page };
  if (spec.outline) context.outline = spec.outline;
  context.segments = spec.segments;
  const request = {};
  if (spec.section !== null && spec.section !== undefined) request.section = spec.section;
  request.translate = spec.requested;
  if (spec.keep && Object.keys(spec.keep).length > 0) request.keep = spec.keep;
  if (spec.corrections && Object.keys(spec.corrections).length > 0) request.corrections = spec.corrections;
  if (spec.replyCorrections && spec.replyCorrections.length > 0) request.replyCorrections = spec.replyCorrections;
  return [
    { type: 'text', text: JSON.stringify(context) },
    { type: 'text', text: JSON.stringify(request) },
  ];
}

/** Whether a request runs on the fallback model: a refusal's resubmission, with a fallback configured. */
function runsOnFallback(spec, model) {
  return Boolean(spec.fallback && model.fallbackId);
}

/** The model id a request uses: the fallback when the request is a refusal's resubmission and one is configured. */
export function modelIdFor(spec, model) {
  return runsOnFallback(spec, model) ? model.fallbackId : model.id;
}

/**
 * The Messages API parameters of a request — the one shape both transports
 * send: the synchronous call as it is, and a batch request as its `params`.
 *
 * `effort` is sent as configured on every request. `thinking` is sent as
 * configured on a request to the primary model, and never on a request to the
 * fallback model: a thinking setting is the configured model's own — Claude
 * Sonnet 5.5 alone accepts `between_tools`, and Claude Opus 5.5 refuses
 * `disabled` — while every model accepts a request without one, which leaves
 * the reasoning level to `effort`. `max_tokens` is computed from the thinking
 * setting the request carries, so a request sent without one, a resubmission on
 * the fallback model included, reserves the reasoning allowance.
 *
 * @param {import('./types.mjs').RequestSpec} spec
 * @param {Object} args
 * @param {import('./config.mjs').TranslationSettings['model']} args.model
 * @param {ReturnType<typeof buildSystem>} args.system
 * @returns {Object} `MessageCreateParamsNonStreaming`.
 */
export function buildMessageParams(spec, { model, system }) {
  const thinking = model.thinking && !runsOnFallback(spec, model) ? model.thinking : undefined;
  return {
    model: modelIdFor(spec, model),
    max_tokens: outputCeiling(spec.items.map((item) => item.source), { thinking }),
    system,
    messages: [{ role: 'user', content: buildUserMessage(spec) }],
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      ...(model.effort ? { effort: model.effort } : {}),
    },
    ...(thinking ? { thinking } : {}),
  };
}

export default {
  OUTPUT_SCHEMA,
  SYSTEM_CACHE_CONTROL,
  HEADING_CONTEXT,
  GENERAL_PROMPT_FILE,
  loadLanguagePrompts,
  loadGeneralPrompt,
  buildSystem,
  pagesFromCatalog,
  planRequests,
  buildUserMessage,
  buildMessageParams,
  modelIdFor,
};
