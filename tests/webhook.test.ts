import { describe, expect, it } from 'vitest';
import { flowResponseFrom } from '../src/webhook.js';

describe('Kapso flow webhook parsing', () => {
  it('uses Kapso parsed flow response data', () => {
    expect(flowResponseFrom({ kapso: { flow_response: { flowToken: 'token', answer: 'claims' } } })).toEqual({ flowToken: 'token', answer: 'claims' });
  });

  it('parses the raw nfm reply response', () => {
    expect(flowResponseFrom({ interactive: { nfm_reply: { response_json: '{"flow_token":"test_flow:service:contact","answer":"claims"}' } } })).toEqual({ flow_token: 'test_flow:service:contact', flowToken: 'test_flow:service:contact', answer: 'claims' });
  });
});
