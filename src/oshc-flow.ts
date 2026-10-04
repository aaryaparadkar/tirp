import type { Database } from './db.js';
import { WhatsAppFlow, type FlowContext, type FlowDefinition } from './flows.js';
import type { FlowResponse } from './types.js';
import { id, now } from './lib.js';

export class OshcServiceFlow extends WhatsAppFlow {
  readonly name = 'oshc_service_flow';

  constructor(private readonly db: Database) { super(); }

  definition(): FlowDefinition {
    return {
      version: '7.2',
      dataApiVersion: '3.0',
      routingModel: { WELCOME: [] },
      screens: [{ id: 'WELCOME', terminal: true, title: 'OSHC service', layout: { type: 'SingleColumnLayout', children: [{ type: 'TextHeading', text: 'OSHC' }, { type: 'TextBody', text: 'Tell us how we can help.' }, { type: 'TextInput', name: 'question', label: 'How can we help?' }, { type: 'Footer', label: 'Submit', onClickAction: { name: 'complete', payload: {} } }] } }],
    };
  }

  async handle(response: FlowResponse, context: FlowContext): Promise<void> {
    await this.db.query('INSERT INTO flow_submissions (id, flow_name, flow_token, phone, response_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id(), this.name, response.flowToken || context.flowToken || null, context.phone, JSON.stringify(response), now()]);
  }
}
