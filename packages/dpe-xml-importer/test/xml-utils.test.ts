import { describe, expect, it } from 'vitest';
import { asArray, child, childRecord, decodePredefinedEntities, isRecord, num, str } from '../src/index.ts';

describe('xml-utils', () => {
  it('isRecord / child / childRecord', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([1])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(child({ a: { b: 1 } }, 'a')).toEqual({ b: 1 });
    expect(child({ a: 1 }, 'a')).toBe(1);
    expect(childRecord({ a: 1 }, 'a')).toBeUndefined();
    expect(childRecord({ a: { b: 1 } }, 'a')).toEqual({ b: 1 });
    expect(childRecord(null, 'a')).toBeUndefined();
  });

  it('asArray normalizes single values and arrays', () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray(1)).toEqual([1]);
    expect(asArray([1, 2])).toEqual([1, 2]);
  });

  it('str trims and rejects empty/non-string', () => {
    expect(str('  abc ')).toBe('abc');
    expect(str('')).toBeNull();
    expect(str('   ')).toBeNull();
    expect(str(42)).toBeNull();
    expect(str(undefined)).toBeNull();
  });

  it('num parses finite numbers only', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num('-3')).toBe(-3);
    expect(num('abc')).toBeNull();
    expect(num('')).toBeNull();
    expect(num('Infinity')).toBeNull();
    expect(num(true)).toBeNull();
  });

  it('decodePredefinedEntities decodes only predefined and numeric entities', () => {
    expect(decodePredefinedEntities('a &lt; b &amp; c &gt; d &quot;e&quot; &apos;f&apos;')).toBe(
      `a < b & c > d "e" 'f'`
    );
    expect(decodePredefinedEntities('&#65;&#x42;')).toBe('AB');
    // custom entities are NOT expanded (XXE-safe)
    expect(decodePredefinedEntities('&xxe;')).toBe('&xxe;');
    expect(decodePredefinedEntities('no entities')).toBe('no entities');
    expect(decodePredefinedEntities('&#x110000;')).toBe('&#x110000;');
  });

  it('str decodes predefined entities', () => {
    expect(str('Mur &lt;=20cm &amp; plâtre')).toBe('Mur <=20cm & plâtre');
  });
});
