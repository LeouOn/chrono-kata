export interface ProviderConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  credentialSource?: 'browser' | 'environment';
  /**
   * Private mode is on for this request: only a local provider may be used,
   * and redirects are not followed.
   */
  privateMode?: boolean;
}
