import { describe, expect, it } from 'vitest';
import { orderPair } from './reference-catalog.js';

describe('orderPair', () => {
  const low = '0198a4b2-0000-7000-8000-000000000001';
  const high = '0198a4b2-0000-7000-8000-0000000000ff';

  it('puts the smaller id first whichever way the pair is given', () => {
    expect(orderPair(low, high)).toEqual([low, high]);
    expect(orderPair(high, low)).toEqual([low, high]);
  });

  it('orders by the whole id, not by its first characters', () => {
    const a = '0198a4b2-0000-7000-8000-00000000000a';
    const b = '0198a4b2-0000-7000-8000-00000000000b';
    expect(orderPair(b, a)).toEqual([a, b]);
    expect(orderPair('ffffffff-0000-7000-8000-000000000000', low)).toEqual([
      low,
      'ffffffff-0000-7000-8000-000000000000',
    ]);
  });
});
