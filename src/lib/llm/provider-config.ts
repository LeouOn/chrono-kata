export interface ProviderConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  credentialSource?: 'browser' | 'environment';
}
