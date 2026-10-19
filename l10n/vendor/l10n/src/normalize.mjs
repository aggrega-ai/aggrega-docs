/**
 * normalize.mjs — Normalization and hashing of source strings.
 *
 * READS nothing and WRITES nothing — pure functions over strings.
 *
 * The rule is documented and STABLE. Changing it would invalidate every key in
 * the translation memory, so it is an explicit migration event rather than an
 * ordinary edit:
 *
 *   normalize(s) = Unicode NFC + stripping of LEADING/TRAILING whitespace only.
 *   Interior whitespace and markup are SIGNIFICANT and are NOT collapsed.
 *
 *   srcHash(s) = sha256(normalize(s)) in hexadecimal (64 chars).
 *   keyOf(s)   = the first 16 hex chars of srcHash(s) — the key used as the index
 *                in the catalog, the translation memory and the worklist. The full
 *                source text is persisted separately (`messages/_source.json`) so
 *                a prefix collision is detectable.
 */

import { createHash } from 'node:crypto';

/** Length, in hex chars, of the key derived from the hash. */
export const KEY_LENGTH = 16;

/**
 * Normalizes a source string: Unicode NFC plus a trim of edge whitespace only.
 * Interior whitespace and markup are left untouched, being significant.
 *
 * @param {string} s
 * @returns {string}
 */
export function normalize(s) {
  if (typeof s !== 'string') {
    throw new TypeError(`normalize: expected a string, received ${typeof s}`);
  }
  // NFC before the trim, so any combining or compatibility whitespace at the
  // edges is normalized consistently before being removed.
  return s.normalize('NFC').replace(/^\s+/, '').replace(/\s+$/, '');
}

/**
 * The hexadecimal sha256 (64 chars) of normalize(s).
 *
 * @param {string} s
 * @returns {string}
 */
export function srcHash(s) {
  return createHash('sha256').update(normalize(s), 'utf8').digest('hex');
}

/**
 * The key: the first KEY_LENGTH hex chars of srcHash(s).
 *
 * @param {string} s
 * @returns {string}
 */
export function keyOf(s) {
  return srcHash(s).slice(0, KEY_LENGTH);
}

export default { normalize, srcHash, keyOf, KEY_LENGTH };
