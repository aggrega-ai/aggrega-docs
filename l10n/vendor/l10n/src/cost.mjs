/**
 * cost.mjs — The offline cost estimate of translating through the Message
 * Batches API: what `prepush` prints beside the units a push still lacks.
 *
 * READS nothing and WRITES nothing: a pure function of the token estimates the
 * caller supplies (`tokens.mjs`, the same estimate `submit` counts its budgets
 * in) and of the rate table below. It makes no network call and reads no price
 * from anywhere at run time, so the figure is an estimate as of the date the
 * table states, never a quote.
 *
 * THE ESTIMATE IS AN UPPER BOUND, counted as the package's budgets are: every
 * estimated input token at the one-hour cache-write rate — the highest rate an
 * input token of a request can be billed at, since the system prompt carries
 * the one-hour cache marker and every other input token is billed lower — and
 * every output token a request may produce (its `max_tokens`) at the output
 * rate. The input estimate is itself an upper bound of one token per UTF-8 byte.
 */

/**
 * The Message Batches API's rates, in US dollars per million tokens, per model
 * id: `cacheWrite`, the one-hour cache write, and `output`. Anthropic's
 * published prices as of `BATCH_RATES_READ`: Claude Opus 5.5 at USD 4
 * input and USD 20 output per million on the Messages API, Claude Sonnet 5.5 at
 * USD 2 and USD 10; the Message Batches API at half of those; a one-hour cache
 * write at twice the input rate. A model the table does not hold gets the token
 * estimate alone.
 */
export const BATCH_RATES = Object.freeze({
  'claude-opus-5-5': Object.freeze({ cacheWrite: 4, output: 10 }),
  'claude-sonnet-5-5': Object.freeze({ cacheWrite: 2, output: 5 }),
});

/** The day of the published prices `BATCH_RATES` holds. */
export const BATCH_RATES_READ = '2026-10-17';

/**
 * The upper-bound cost, in US dollars, of a batch of requests whose estimates
 * sum to `input` and `output` tokens on `model`, or null when the table holds
 * no rate for the model.
 *
 * @param {Object} args
 * @param {string} args.model
 * @param {number} args.input   the summed input estimate.
 * @param {number} args.output  the summed output ceiling.
 * @param {Object} [args.rates] the rate table (default: `BATCH_RATES`).
 * @returns {number|null}
 */
export function batchCostUpperBound({ model, input, output, rates = BATCH_RATES }) {
  const rate = Object.prototype.hasOwnProperty.call(rates, model) ? rates[model] : null;
  if (!rate) return null;
  return (input * rate.cacheWrite + output * rate.output) / 1_000_000;
}

/** A dollar amount as the refusal prints it: two decimals, and at least USD 0.01 for anything above zero. */
export function formatUsd(amount) {
  if (amount > 0 && amount < 0.01) return 'under USD 0.01';
  return `USD ${amount.toFixed(2)}`;
}

export default { BATCH_RATES, BATCH_RATES_READ, batchCostUpperBound, formatUsd };
