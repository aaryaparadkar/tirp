import { describe, expect, it } from 'vitest';
import { chunkDocument } from '../src/kb/loader.js';
import { retrieve } from '../src/kb/index.js';
import type { KbChunk } from '../src/types.js';

const SAMPLE = `Title: Sample
URL Source: https://example.com/a

# Online claims

You can make claims for most medical services through Online Member Services.
Provide details, upload receipts, and ensure your Australian bank account is correct.

# Pharmacy

Essentials OSHC includes benefits towards eligible prescription medicines with a $30 contribution.
`;

describe('kb chunking', () => {
  it('preserves source metadata', () => {
    const chunks = chunkDocument('13-oshc-online-claims.md', 'T', 'https://example.com', SAMPLE, 500);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].file).toBe('13-oshc-online-claims.md');
    expect(chunks[0].url).toBe('https://example.com');
  });
});

describe('retrieval', () => {
  const chunks: KbChunk[] = [
    { id: 'a#0', file: '13-oshc-online-claims.md', title: 'Claims', url: 'https://example.com/claims', heading: 'Online claims', content: 'make claims through Online Member Services upload receipts bank account' },
    { id: 'b#0', file: '02-essentials-oshc.md', title: 'Essentials', url: 'https://example.com/essentials', heading: 'Pharmacy', content: 'prescription medicines $30 contribution annual limit' },
  ];
  it('ranks claims query to claims file', () => {
    const res = retrieve(chunks, 'How do I claim a GP visit with receipts?', 'claims', 2);
    expect(res[0].chunk.file).toBe('13-oshc-online-claims.md');
  });
  it('ranks pharmacy query to pharmacy file', () => {
    const res = retrieve(chunks, 'Are prescription medicines covered?', 'pharmacy', 2);
    expect(res[0].chunk.file).toBe('02-essentials-oshc.md');
  });
});
