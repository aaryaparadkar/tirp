import type { FlowResponse } from './types.js';

export interface FlowContext {
  phone: string;
  contactId?: string;
  flowToken?: string;
  data: Record<string, unknown>;
}

export interface FlowDefinition {
  version: string;
  dataApiVersion: string;
  routingModel: Record<string, string[]>;
  screens: Array<Record<string, unknown>>;
}

/** Extend this class to add a new WhatsApp Flow without changing webhook dispatch. */
export abstract class WhatsAppFlow<TResponse extends FlowResponse = FlowResponse> {
  abstract readonly name: string;

  abstract definition(): FlowDefinition;

  abstract handle(response: TResponse, context: FlowContext): Promise<void> | void;

  accepts(response: TResponse, _context: FlowContext): boolean {
    return response.flowName === this.name || response.flowToken?.startsWith(`${this.name}:`) === true;
  }
}

export class FlowRegistry {
  private readonly flows = new Map<string, WhatsAppFlow>();

  register(flow: WhatsAppFlow): this {
    if (this.flows.has(flow.name)) throw new Error(`Flow already registered: ${flow.name}`);
    this.flows.set(flow.name, flow);
    return this;
  }

  get(name: string): WhatsAppFlow | undefined {
    return this.flows.get(name);
  }

  async dispatch(response: FlowResponse, context: FlowContext): Promise<boolean> {
    const flow = (response.flowName ? this.get(response.flowName) : undefined) || [...this.flows.values()].find((candidate) => candidate.accepts(response, context));
    if (!flow) return false;
    await flow.handle(response, context);
    return true;
  }
}
