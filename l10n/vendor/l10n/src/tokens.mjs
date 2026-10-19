/**
 * tokens.mjs — The one token estimator: an offline upper bound on the tokens a
 * request costs, used for the section split, the per-request output ceiling and
 * the per-submission budgets alike.
 *
 * READS nothing and WRITES nothing, and makes no network call: estimating never
 * asks the API to count.
 *
 * THE CRITERION. A text is estimated at one token per UTF-8 byte. That is an
 * upper bound on the assumption that every token covers at least one byte, as a
 * byte-level tokenizer's tokens do; the estimate is never checked against the
 * API's own count, which would need a call. A
 * request's input estimate is the byte count of its system blocks, its messages
 * and its output schema, plus `REQUEST_OVERHEAD_TOKENS` for the message framing
 * and the output-format instructions the API adds, which no byte count of the
 * request covers. For Italian or English prose the estimate runs well above the
 * count the API reports, which is the direction a spending cap needs.
 *
 * A request's output estimate is its `max_tokens`, which the API enforces as a
 * ceiling on each response: reasoning, which the API bills as output, counts
 * against it too. So a request that can reason reserves an allowance for it,
 * and one whose thinking setting turns reasoning off reserves none
 * (`reservesReasoning`). The API bills what a response generates, never its
 * ceiling, so the allowance moves the budgets and the estimate, not the bill.
 *
 * THE CACHED SHARE of a request's input estimate (`cachedEstimates`) is the
 * estimate of the longest cache-marked prefix of the request that an earlier
 * request in the same list also marks: what the request can read from a cache
 * entry the earlier one writes, the rest being uncached. A prefix is the request's
 * model, thinking and output settings and its blocks up to and including a block
 * carrying `cache_control`, in the order the API renders them (system, then
 * messages), and two prefixes are the same when those are byte-identical, as
 * the API's prefix match requires. It is what caching saves at best and never a
 * promise: a cache hit inside a batch is best-effort, a prefix shorter than the
 * model's minimum cacheable length is not cached, and an entry can expire
 * between two requests. No budget subtracts it.
 */

import { createHash } from 'node:crypto';

/** The allowance for message framing and the output-format instructions, per request. */
export const REQUEST_OVERHEAD_TOKENS = 512;

/** The output allowance per requested identifier: its key and the JSON around its text. */
export const PER_ID_OUTPUT_TOKENS = 24;

/** The output allowance of a request that can reason, for reasoning at the lowest setting its model accepts. */
export const REASONING_OUTPUT_TOKENS = 2048;

/**
 * The thinking settings under which a model writes no reasoning before its reply:
 * `disabled`, and `between_tools`, which reasons only between tool calls, and a
 * translation request carries no tool.
 */
const NON_REASONING_THINKING = Object.freeze(['disabled', 'between_tools']);

/**
 * The smallest `max_tokens` a request carries: room for the reply's JSON
 * envelope and a few short segments however little the request asks for, so a
 * one-segment section is never cut off by its own framing.
 */
export const MIN_OUTPUT_TOKENS = 1024;

/**
 * The largest `max_tokens` a request carries. The SDK refuses a non-streaming
 * request whose `max_tokens` implies more than ten minutes (above 21,333 at its
 * assumed rate), and both transports send non-streaming requests.
 */
export const MAX_OUTPUT_TOKENS = 16384;

/**
 * The estimated tokens of a text: its UTF-8 byte count.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0;
}

/**
 * Whether a request carrying this thinking setting can reason before its reply:
 * yes without a setting, which leaves the model's own default (adaptive thinking
 * on Claude Opus 5.5, which cannot turn it off), and with any setting that
 * reasons; no for `disabled` and `between_tools`.
 *
 * @param {{type: string}|undefined|null} thinking  the `thinking` parameter the request carries.
 * @returns {boolean}
 */
export function reservesReasoning(thinking) {
  return !(thinking && NON_REASONING_THINKING.includes(thinking.type));
}

/**
 * The output ceiling of a request: the requested sources' estimate and an
 * allowance per identifier, raised to `MIN_OUTPUT_TOKENS` when it is smaller,
 * plus `REASONING_OUTPUT_TOKENS` when the request can reason
 * (`reservesReasoning`), capped at `MAX_OUTPUT_TOKENS`.
 *
 * @param {string[]} requestedSources  the source text of each requested identifier, once each.
 * @param {Object} [options]
 * @param {{type: string}} [options.thinking]  the `thinking` parameter the request carries; none when it carries none.
 * @returns {number}
 */
export function outputCeiling(requestedSources, { thinking } = {}) {
  const text = requestedSources.reduce((n, s) => n + estimateTokens(s), 0);
  const reasoning = reservesReasoning(thinking) ? REASONING_OUTPUT_TOKENS : 0;
  const reply = Math.max(MIN_OUTPUT_TOKENS, text + PER_ID_OUTPUT_TOKENS * requestedSources.length);
  return Math.min(MAX_OUTPUT_TOKENS, reply + reasoning);
}

/**
 * The estimate of a Messages API request's parameters.
 *
 * @param {{system?: Array<{text:string}>|string, messages: Array<{content: string|Array<{text?:string}>}>, max_tokens: number, output_config?: {format?: {schema?: Object}}}} params
 * @returns {{input: number, output: number}}
 */
export function estimateRequest(params) {
  const textOf = (content) =>
    typeof content === 'string' ? content : (content || []).map((block) => block.text || '').join('');
  let input = REQUEST_OVERHEAD_TOKENS + estimateTokens(textOf(params.system));
  for (const message of params.messages || []) input += estimateTokens(textOf(message.content));
  const schema = params.output_config && params.output_config.format && params.output_config.format.schema;
  if (schema) input += estimateTokens(JSON.stringify(schema));
  return { input, output: params.max_tokens };
}

/** The cache-marked prefixes of a request's parameters, in render order: each a digest of its bytes and its estimate. */
function markedPrefixes(params) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify([params.model, params.thinking ?? null, params.output_config ?? null]));
  const blocksOf = (content) => (typeof content === 'string' ? [{ text: content }] : content || []);
  const prefixes = [];
  let tokens = 0;
  const visit = (block) => {
    const text = block.text || '';
    hash.update(`\u0000${text.length}:`);
    hash.update(text);
    tokens += estimateTokens(text);
    if (block.cache_control) prefixes.push({ digest: hash.copy().digest('hex'), tokens });
  };
  for (const block of blocksOf(params.system)) visit(block);
  for (const message of params.messages || []) {
    hash.update(`\u0001${message.role}`);
    for (const block of blocksOf(message.content)) visit(block);
  }
  return prefixes;
}

/**
 * The cached share of each request's input estimate, for requests sent
 * together in this order: per request, the estimate of its longest cache-marked
 * prefix that an earlier request in the list also marks, or 0.
 *
 * @param {Array<Object>} paramsList  Messages API parameters, in their stable order.
 * @returns {number[]}                one figure per request, each at most its input estimate.
 */
export function cachedEstimates(paramsList) {
  const written = new Set();
  return paramsList.map((params) => {
    const prefixes = markedPrefixes(params);
    let cached = 0;
    for (const prefix of prefixes) if (written.has(prefix.digest)) cached = Math.max(cached, prefix.tokens);
    for (const prefix of prefixes) written.add(prefix.digest);
    return cached;
  });
}

export default {
  estimateTokens,
  outputCeiling,
  reservesReasoning,
  estimateRequest,
  cachedEstimates,
  REQUEST_OVERHEAD_TOKENS,
  REASONING_OUTPUT_TOKENS,
  MIN_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
};
