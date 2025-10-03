import browser from 'webextension-polyfill';
import type {
  CommandEnvelope,
  CreatePayload,
  CreateResponse,
  ParsePayload,
  ParseResponse,
  QuickAddSettings
} from './types';

export type BackgroundRequest =
  | { type: 'quickadd:parse'; payload: ParsePayload }
  | { type: 'quickadd:create'; payload: CreatePayload }
  | { type: 'quickadd:get-settings' }
  | { type: 'quickadd:save-settings'; payload: QuickAddSettings }
  | { type: 'quickadd:set-ai-config'; payload: { enabled: boolean; provider: 'gemini' | 'huggingface' | 'local'; apiKey?: string } }
  | { type: 'quickadd:clear-history' }
  | { type: 'quickadd:auth-status' }
  | { type: 'quickadd:auth-connect' }
  | { type: 'quickadd:auth-disconnect' }
  | { type: 'quickadd:log'; payload: { level?: 'debug' | 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> } };

export type BackgroundResponse =
  | { type: 'quickadd:parse:result'; payload: ParseResponse }
  | { type: 'quickadd:create:result'; payload: CreateResponse }
  | { type: 'quickadd:get-settings:result'; payload: QuickAddSettings }
  | { type: 'quickadd:clear-history:result'; payload: { removed: number } }
  | { type: 'quickadd:auth-status:result'; payload: { connected: boolean; tokenExpiry?: number; clientId: string; redirectUri: string; scopes: string[]; flow: 'native' | 'webauth' | null } }
  | { type: 'quickadd:auth-ack'; payload: { ok: boolean; error?: string } }
  | { type: 'quickadd:ack' };

export type ContentMessage =
  | { type: 'quickadd:command'; payload: CommandEnvelope }
  | { type: 'quickadd:toast'; payload: { kind: 'success' | 'error' | 'info'; message: string } };

export type RuntimeMessage = BackgroundRequest | BackgroundResponse | ContentMessage;

export function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: string }).type;
  return typeof type === 'string' && type.startsWith('quickadd:') && !type.includes(':result');
}

export function isBackgroundResponse(message: unknown): message is BackgroundResponse {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: string }).type;
  return typeof type === 'string' && type.includes(':result');
}

export function isContentMessage(message: unknown): message is ContentMessage {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: string }).type;
  return type === 'quickadd:command' || type === 'quickadd:toast';
}

export async function sendBackgroundRequest<T extends BackgroundRequest>(request: T) {
  return browser.runtime.sendMessage(request) as Promise<BackgroundResponse>;
}
