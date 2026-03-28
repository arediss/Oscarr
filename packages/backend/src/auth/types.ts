export interface AuthResult {
  email: string;
  displayName: string;
  avatar?: string | null;
  providerData: Record<string, unknown>;
}

export interface AuthProviderConfig {
  id: string;
  label: string;
  type: 'oauth' | 'credentials';
}
