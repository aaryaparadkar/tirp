import { describe, expect, it } from 'vitest';
import { FlowRegistry, WhatsAppFlow, type FlowContext, type FlowDefinition } from '../src/flows.js';

class TestFlow extends WhatsAppFlow {
  readonly name = 'test_flow';
  definition(): FlowDefinition { return { version: '7.2', dataApiVersion: '3.0', routingModel: { WELCOME: [] }, screens: [] }; }
  handled = false;
  handle(_response: Record<string, unknown>, _context: FlowContext): void { this.handled = true; }
}

describe('WhatsApp flow extension point', () => {
  it('registers and dispatches a concrete flow', async () => {
    const flow = new TestFlow();
    const registry = new FlowRegistry().register(flow);
    expect(await registry.dispatch({ flowName: 'test_flow' }, { phone: '+15551234567', data: {} })).toBe(true);
    expect(flow.handled).toBe(true);
  });

  it('dispatches by a correlated flow token when Kapso reports a generic flow name', async () => {
    const flow = new TestFlow();
    const registry = new FlowRegistry().register(flow);
    expect(await registry.dispatch({ flowName: 'flow', flowToken: 'test_flow:service:contact' }, { phone: '+15551234567', data: {} })).toBe(true);
    expect(flow.handled).toBe(true);
  });

  it('ignores an unknown flow', async () => {
    expect(await new FlowRegistry().dispatch({ flowName: 'missing' }, { phone: '+15551234567', data: {} })).toBe(false);
  });
});
