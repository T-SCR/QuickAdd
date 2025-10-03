import browser from 'webextension-polyfill';
import type { Identity } from 'webextension-polyfill';

const TOKEN_STORAGE_KEY = 'quickadd:google-oauth-token';
const CLOCK_SKEW_MS = 60_000;

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
}

type MaybeToken = string | undefined;

type IdentityNamespace = Identity.Static | undefined;

function getIdentityNamespace(): IdentityNamespace {
  return (browser.identity as Identity.Static | undefined) ?? undefined;
}

function getManifestOAuth() {
  const manifest = browser.runtime.getManifest() as chrome.runtime.ManifestV3;
  return manifest.oauth2 ?? undefined;
}

function getClientId(): string {
  const oauth = getManifestOAuth();
  if (oauth?.client_id) return oauth.client_id;
  throw new Error('Google OAuth client ID is not configured.');
}

function getScopes(): string[] {
  const oauth = getManifestOAuth();
  if (oauth?.scopes?.length) return oauth.scopes;
  return [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/tasks'
  ];
}

function supportsNativeAuth(identity: IdentityNamespace): boolean {
  const chromeIdentity = identity as any;
  return Boolean(chromeIdentity && typeof chromeIdentity.getAuthToken === 'function');
}

function supportsWebAuth(identity: IdentityNamespace): boolean {
  const chromeIdentity = identity as any;
  return Boolean(chromeIdentity && typeof chromeIdentity.launchWebAuthFlow === 'function');
}

async function getStoredToken(): Promise<StoredToken | undefined> {
  const stored = await browser.storage.local.get(TOKEN_STORAGE_KEY);
  const token = stored[TOKEN_STORAGE_KEY] as StoredToken | undefined;
  if (!token) return undefined;
  if (!token.accessToken || typeof token.expiresAt !== 'number') return undefined;
  if (!Array.isArray(token.scopes)) return undefined;
  return token;
}

async function saveStoredToken(token: StoredToken) {
  await browser.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
}

async function clearStoredToken() {
  await browser.storage.local.remove(TOKEN_STORAGE_KEY);
}

function isTokenValid(token: StoredToken, scopes: string[]): boolean {
  if (Date.now() + CLOCK_SKEW_MS >= token.expiresAt) return false;
  if (token.scopes.length !== scopes.length) return false;
  return token.scopes.every((scope) => scopes.includes(scope));
}

async function acquireNativeToken(identity: IdentityNamespace, interactive: boolean): Promise<MaybeToken> {
  const chromeIdentity = identity as any;
  if (!chromeIdentity || typeof chromeIdentity.getAuthToken !== 'function') return undefined;
  try {
    const token = await chromeIdentity.getAuthToken({ interactive });
    if (typeof token === 'string' && token) {
      await clearStoredToken();
      return token;
    }
    return undefined;
  } catch (error) {
    console.error('[QuickAdd] getAuthToken failed', error);
    return undefined;
  }
}

function parseHashParams(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) {
    const parsed = new URL(url);
    return parsed.searchParams;
  }
  const fragment = url.substring(hashIndex + 1);
  return new URLSearchParams(fragment);
}

async function acquireWebToken(identity: IdentityNamespace, scopes: string[], interactive: boolean): Promise<MaybeToken> {
  const chromeIdentity = identity as any;
  if (!chromeIdentity || typeof chromeIdentity.launchWebAuthFlow !== 'function') return undefined;

  const stored = await getStoredToken();
  if (stored && isTokenValid(stored, scopes)) {
    return stored.accessToken;
  }

  if (!interactive) return undefined;

  const clientId = getClientId();
  const redirectUri = chromeIdentity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('prompt', 'consent');

  try {
    const responseUrl = await chromeIdentity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
    if (!responseUrl) return undefined;
    const params = parseHashParams(responseUrl);
    const accessToken = params.get('access_token') ?? undefined;
    const expiresIn = Number(params.get('expires_in') ?? '3600');
    if (!accessToken) return undefined;
    const expiresAt = Date.now() + Math.max(expiresIn, 60) * 1000;
    await saveStoredToken({ accessToken, expiresAt, scopes });
    return accessToken;
  } catch (error) {
    console.error('[QuickAdd] launchWebAuthFlow failed', error);
    return undefined;
  }
}

async function acquireToken(interactive: boolean): Promise<MaybeToken> {
  const identity = getIdentityNamespace();
  if (!identity) return undefined;
  const scopes = getScopes();

  const stored = await getStoredToken();
  if (stored && isTokenValid(stored, scopes)) {
    return stored.accessToken;
  }

  if (supportsNativeAuth(identity)) {
    const nativeToken = await acquireNativeToken(identity, interactive);
    if (nativeToken) return nativeToken;
  }

  if (!supportsWebAuth(identity)) {
    return undefined;
  }

  return acquireWebToken(identity, scopes, interactive);
}

export async function getAccessToken(): Promise<string> {
  const token = (await acquireToken(false)) ?? (await acquireToken(true));
  if (!token) {
    throw new Error('Google authentication is required. Please sign in.');
  }
  return token;
}

export async function invalidateAccessToken(token: string) {
  const identity = getIdentityNamespace();
  if (!identity) return;

  const chromeIdentity = identity as any;
  if (supportsNativeAuth(identity) && typeof chromeIdentity.removeCachedAuthToken === 'function') {
    try {
      await chromeIdentity.removeCachedAuthToken({ token });
    } catch (error) {
      console.warn('[QuickAdd] removeCachedAuthToken failed', error);
    }
    return;
  }

  await clearStoredToken();
}

export async function resetStoredToken() {
  await clearStoredToken();
}

export async function getAuthStatus() {
  const identity = getIdentityNamespace();
  const scopes = getScopes();
  let redirectUri = '';
  try {
    const chromeIdentity = identity as any;
    redirectUri = chromeIdentity?.getRedirectURL?.() ?? '';
  } catch {}
  const clientId = (() => {
    try {
      return getClientId();
    } catch {
      return '';
    }
  })();
  const stored = await getStoredToken();
  const connected = stored ? isTokenValid(stored, scopes) : false;
  const flow: 'native' | 'webauth' | null = identity ? (supportsNativeAuth(identity) ? 'native' : supportsWebAuth(identity) ? 'webauth' : null) : null;
  return {
    connected,
    tokenExpiry: stored?.expiresAt,
    clientId,
    redirectUri,
    scopes,
    flow
  };
}

export async function connectInteractive(): Promise<boolean> {
  const token = await acquireToken(true);
  return !!token;
}

export async function disconnectGoogle(): Promise<void> {
  // Clear stored web token
  await clearStoredToken();
  // Best-effort remove cached Chrome token if present
  const identity = getIdentityNamespace();
  const chromeIdentity = identity as any;
  if (identity && supportsNativeAuth(identity) && typeof chromeIdentity.getAuthToken === 'function' && typeof chromeIdentity.removeCachedAuthToken === 'function') {
    try {
      const token = await chromeIdentity.getAuthToken({ interactive: false });
      if (token) {
        await chromeIdentity.removeCachedAuthToken({ token });
      }
    } catch (err) {
      console.warn('[QuickAdd] disconnectGoogle: could not clear native token', err);
    }
  }
}
