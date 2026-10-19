import '../test/no-network.mjs';
import { describe, it, expect } from 'vitest';
import { normalize, srcHash, keyOf, KEY_LENGTH } from './normalize.mjs';

// Sample strings are Italian because Italian is the source locale: these are the
// shapes the extractor really hands to the hash.
describe('normalize', () => {
  it('strips edge whitespace ONLY, preserving the interior', () => {
    expect(normalize('  ciao mondo  ')).toBe('ciao mondo');
    expect(normalize('a   b')).toBe('a   b'); // interior runs are not collapsed
    expect(normalize('\n\t testo \t\n')).toBe('testo');
  });

  it('leaves interior markup untouched', () => {
    const html = '<p>ciao <strong>mondo</strong></p>';
    expect(normalize(`  ${html}  `)).toBe(html);
  });

  it('applies Unicode NFC normalization', () => {
    // "é" as e + combining acute (NFD) against the precomposed form (NFC).
    // Written as escapes deliberately: an editor or a formatter that normalizes
    // the file would silently collapse the two literals into one and the
    // assertion below would then pass while testing nothing.
    const nfd = '\u0065\u0301';
    const nfc = '\u00e9';
    expect(nfd).not.toBe(nfc); // distinct strings on input
    expect(normalize(nfd)).toBe(normalize(nfc)); // equivalent after normalize
  });

  it('throws on non-string input', () => {
    expect(() => normalize(42)).toThrow(TypeError);
  });
});

describe('srcHash / keyOf', () => {
  it('is deterministic: the same string yields the same key', () => {
    expect(keyOf('Testo')).toBe(keyOf('Testo'));
    expect(srcHash('Testo')).toBe(srcHash('Testo'));
  });

  it('produces a key of KEY_LENGTH (16) hex chars', () => {
    const k = keyOf('qualcosa');
    expect(k).toHaveLength(KEY_LENGTH);
    expect(k).toMatch(/^[0-9a-f]{16}$/);
    expect(srcHash('qualcosa')).toHaveLength(64);
    expect(srcHash('qualcosa').startsWith(k)).toBe(true);
  });

  it('treats NFD and NFC as equivalent: both give the same key', () => {
    expect(keyOf('caff\u0065\u0301')).toBe(keyOf('caff\u00e9'));
  });

  it('ignores the edges: trimming does not change the key', () => {
    expect(keyOf('  Testo  ')).toBe(keyOf('Testo'));
  });

  it('changes the key when the text changes', () => {
    expect(keyOf('Testo')).not.toBe(keyOf('Testo!'));
    expect(keyOf('a   b')).not.toBe(keyOf('a b')); // interior whitespace is significant
  });
});
