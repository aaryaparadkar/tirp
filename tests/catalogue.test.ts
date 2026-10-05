import { describe, expect, it } from 'vitest';
import { catalogueReply, servicesReply } from '../src/catalogue.js';

describe('OSHC catalogue replies', () => {
  it('renders categories as a WhatsApp menu', () => {
    expect(catalogueReply([{ id: 'cover', name: 'Cover', description: 'Health cover help' }])).toContain('1. Cover');
  });

  it('renders service descriptions', () => {
    expect(servicesReply([{ id: 'claims', categoryId: 'cover', name: 'Claims', description: 'Submit a claim' }])).toContain('Submit a claim');
  });
});
