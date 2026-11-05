export interface BotCredentials {
  email: string;
  password: string;
  totpSecret: string;
}

export function isPublicSupabaseKey(key: unknown): boolean;
export function normalizeSupabaseUrl(raw: string): string;
export function keychainServiceFor(url: string): string;
export function botCredentialsExist(service: string): Promise<boolean>;
export function readBotCredentials(service: string): Promise<BotCredentials | null>;
export function saveBotCredentials(service: string, credentials: BotCredentials): Promise<void>;
export function deleteBotCredentials(service: string): Promise<boolean>;
