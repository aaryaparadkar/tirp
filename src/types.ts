export interface CatalogueCategory {
  id: string;
  name: string;
  description: string;
}

export interface CatalogueService {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  flowName?: string;
  flowId?: string;
  actionLabel?: string;
}

export interface Contact {
  id: string;
  phone: string;
  name: string;
  locale: string;
  optedIn: boolean;
}

export interface FlowResponse {
  flowToken?: string;
  flowName?: string;
  [key: string]: unknown;
}
