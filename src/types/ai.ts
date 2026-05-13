export interface AIModel {
  id: string;
  name: string;
  customName?: string;
  type: 'chat' | 'embedding' | 'image';
  isDefault: boolean;
  isDefaultQuickAdd: boolean;
  isDefaultTextTest: boolean;
  isDefaultTranslation: boolean;
}

export interface Endpoint {
  id: string;
  provider: string;
  apiKey: string;
  apiUrl: string;
  isVerified: boolean;
  models: AIModel[];
}
