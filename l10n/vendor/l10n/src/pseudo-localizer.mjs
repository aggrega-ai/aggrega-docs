/**
 * pseudo-localizer.mjs — A deterministic stand-in translator, for tests and
 * programmatic dry runs.
 *
 * READS nothing and WRITES nothing, and makes no network call: it transforms the
 * strings it is handed.
 *
 * It honours the contract the engine calls a backend through — it reads the
 * `items` of each request and returns `{translations, model}` — so a caller can inject it
 * wherever the engine or the command line accepts an injected backend. It is not
 * a configurable backend: no `backend.kind`, no `I18N_BACKEND` value and no entry
 * of `SUPPORTED_BACKENDS` names it, so a configuration can never select it and a
 * run against real content never reaches it by accident.
 *
 * THE TRANSFORM. Each ASCII letter outside the item's protected spans becomes a
 * fixed accented letter (`a` → `á`, `T` → `Ŧ`, …); every other character is kept.
 * A letter becomes a letter, so Markdown that depends on the class of a
 * neighbouring character — emphasis delimiters, for one — parses the same, and
 * the output differs from the source wherever there was prose to translate.
 * Protected spans (`item.protected`, `[start, end)` offsets into `item.source`)
 * are copied byte for byte. They are the spans the content adapter computed and
 * stored on the catalogue unit: the pseudo-localizer detects nothing itself.
 */

const LOWER = 'áƀçďéƒğĥíĵķĺɱñóþǫŕšţúṽŵẋýž';
const UPPER = 'ÁɃÇĎÉƑĞĤÍĴĶĹṀÑÓÞǪŔŠŦÚṼŴẊÝŽ';

/** The accented counterpart of an ASCII letter, or the character itself. */
function accent(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 97 && code <= 122) return LOWER[code - 97];
  if (code >= 65 && code <= 90) return UPPER[code - 65];
  return ch;
}

/**
 * Pseudo-localizes a string, leaving protected spans byte-identical.
 *
 * @param {string} source
 * @param {Array<[number, number]>} [spans]  protected ranges of `source`, sorted and non-overlapping.
 * @returns {string}
 */
export function pseudoLocalize(source, spans = []) {
  let out = '';
  let at = 0;
  const transform = (part) => part.replace(/[A-Za-z]/g, accent);
  for (const [start, end] of spans) {
    if (start > at) out += transform(source.slice(at, start));
    out += source.slice(Math.max(at, start), end);
    at = Math.max(at, end);
  }
  return out + transform(source.slice(at));
}

/**
 * Creates the pseudo-localizer.
 *
 * @param {Object} [options]
 * @param {string} [options.model]  the model name the job log records (default `pseudo`).
 * @returns {{translate: (args: {items: Array<{srcHash:string, source:string, protected?:Array<[number,number]>}>, lang?: string}) => Promise<{translations: Object.<string,string>, model: string}>}}
 */
export function createPseudoLocalizer({ model = 'pseudo' } = {}) {
  return {
    async translate({ items = [] } = {}) {
      const translations = {};
      for (const item of items) translations[item.srcHash] = pseudoLocalize(item.source, item.protected || []);
      return { translations, model };
    },
  };
}

export default { pseudoLocalize, createPseudoLocalizer };
