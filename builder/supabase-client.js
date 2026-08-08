import { getSupabaseConfig } from './supabase-config.js';

export const SUPABASE_SESSION_STORAGE_KEY = 'lc_forge_supabase_session_v1';

const REFRESH_SKEW_SECONDS = 60;

export class SupabaseRequestError extends Error {
  constructor(message, { status = 0, code = '', details = '' } = {}) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeSupabaseConfig(rawConfig) {
  const url = String(rawConfig?.url || '').trim().replace(/\/$/, '');
  const publishableKey = String(rawConfig?.publishableKey || '').trim();
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Supabase URL must be a valid HTTPS URL.');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
      throw new Error('Supabase URL must use HTTPS and a supabase.co project host.');
    }
  }
  return { url, publishableKey };
}

export function isSupabaseConfigured(config) {
  try {
    const normalized = normalizeSupabaseConfig(config);
    return Boolean(normalized.url && normalized.publishableKey);
  } catch {
    return false;
  }
}

export function createSupabaseClient({
  config = getSupabaseConfig(),
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  now = () => Date.now(),
} = {}) {
  const normalizedConfig = normalizeSupabaseConfig(config);
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  let session = readStoredSession(storage);
  let refreshPromise = null;
  const listeners = new Set();

  function requireConfiguration() {
    if (!isSupabaseConfigured(normalizedConfig)) {
      throw new SupabaseRequestError('Cloud setup is incomplete. Add the browser-safe Supabase Publishable key.', {
        code: 'configuration_missing',
      });
    }
  }

  function notify(event) {
    const snapshot = session ? structuredClone(session) : null;
    for (const listener of listeners) listener(event, snapshot);
  }

  function persist(nextSession, event = 'SESSION_UPDATED') {
    session = normalizeSession(nextSession);
    try {
      if (session) storage?.setItem?.(SUPABASE_SESSION_STORAGE_KEY, JSON.stringify(session));
      else storage?.removeItem?.(SUPABASE_SESSION_STORAGE_KEY);
    } catch {
      // A valid in-memory session still works when browser storage is unavailable.
    }
    notify(event);
    return session;
  }

  async function requestJson(url, options = {}) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch {
      throw new SupabaseRequestError('The cloud service could not be reached. Your local work is still available.', {
        code: 'network_error',
      });
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const message = typeof payload === 'object'
        ? payload?.msg || payload?.message || payload?.error_description || payload?.error || 'Cloud request failed.'
        : 'Cloud request failed.';
      throw new SupabaseRequestError(String(message), {
        status: response.status,
        code: typeof payload === 'object' ? String(payload?.code || payload?.error_code || '') : '',
        details: typeof payload === 'object' ? String(payload?.details || payload?.hint || '') : '',
      });
    }
    return payload;
  }

  async function signInWithPassword({ email, password }) {
    requireConfiguration();
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail || !String(password || '')) {
      throw new SupabaseRequestError('Enter both email and password.', { code: 'invalid_credentials' });
    }
    const payload = await requestJson(`${normalizedConfig.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: normalizedConfig.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalizedEmail, password: String(password) }),
    });
    return persist(payload, 'SIGNED_IN');
  }

  async function refreshSession() {
    requireConfiguration();
    if (!session?.refresh_token) {
      persist(null, 'SIGNED_OUT');
      throw new SupabaseRequestError('Your cloud session expired. Sign in again.', { code: 'session_expired' });
    }
    if (refreshPromise) return refreshPromise;
    refreshPromise = requestJson(`${normalizedConfig.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: normalizedConfig.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then((payload) => persist(payload, 'TOKEN_REFRESHED'))
      .catch((error) => {
        if (error.status === 400 || error.status === 401) persist(null, 'SIGNED_OUT');
        throw error;
      })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  }

  async function getValidSession({ allowOffline = true } = {}) {
    if (!session) return null;
    if (!session.expires_at || session.expires_at > Math.floor(now() / 1000) + REFRESH_SKEW_SECONDS) {
      return session;
    }
    try {
      return await refreshSession();
    } catch (error) {
      if (allowOffline && error.code === 'network_error') return session;
      throw error;
    }
  }

  async function initialize() {
    if (!session || !isSupabaseConfigured(normalizedConfig)) {
      notify(session ? 'INITIAL_SESSION' : 'SIGNED_OUT');
      return session;
    }
    try {
      await getValidSession();
      notify('INITIAL_SESSION');
      return session;
    } catch {
      return null;
    }
  }

  async function signOut() {
    const current = session;
    try {
      if (current?.access_token && isSupabaseConfigured(normalizedConfig)) {
        await requestJson(`${normalizedConfig.url}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: normalizedConfig.publishableKey,
            Authorization: `Bearer ${current.access_token}`,
          },
        });
      }
    } finally {
      persist(null, 'SIGNED_OUT');
    }
  }

  async function authenticatedHeaders(extra = {}) {
    requireConfiguration();
    const activeSession = await getValidSession({ allowOffline: false });
    if (!activeSession?.access_token) {
      throw new SupabaseRequestError('Sign in to use cloud builder storage.', { code: 'not_authenticated' });
    }
    return {
      apikey: normalizedConfig.publishableKey,
      Authorization: `Bearer ${activeSession.access_token}`,
      ...extra,
    };
  }

  async function rest(path, { method = 'GET', body, headers = {} } = {}) {
    const requestHeaders = await authenticatedHeaders({
      Accept: 'application/json',
      ...headers,
    });
    const hasBody = body !== undefined;
    if (hasBody && !requestHeaders['Content-Type']) requestHeaders['Content-Type'] = 'application/json';
    return requestJson(`${normalizedConfig.url}/rest/v1/${String(path).replace(/^\//, '')}`, {
      method,
      headers: requestHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  }

  async function storageRequest(path, { method = 'GET', body, headers = {} } = {}) {
    const requestHeaders = await authenticatedHeaders(headers);
    return requestJson(`${normalizedConfig.url}/storage/v1/${String(path).replace(/^\//, '')}`, {
      method,
      headers: requestHeaders,
      body,
    });
  }

  return Object.freeze({
    config: Object.freeze({ ...normalizedConfig }),
    initialize,
    signInWithPassword,
    signOut,
    refreshSession,
    getSession: () => session ? structuredClone(session) : null,
    getValidSession,
    rest,
    storageRequest,
    isConfigured: () => isSupabaseConfigured(normalizedConfig),
    onAuthStateChange(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

function normalizeSession(payload) {
  if (!payload || typeof payload !== 'object' || !payload.access_token) return null;
  const expiresAt = Number(payload.expires_at)
    || Math.floor(Date.now() / 1000) + Math.max(1, Number(payload.expires_in) || 3600);
  return {
    access_token: String(payload.access_token),
    refresh_token: String(payload.refresh_token || ''),
    token_type: String(payload.token_type || 'bearer'),
    expires_at: expiresAt,
    user: payload.user && typeof payload.user === 'object' ? payload.user : null,
  };
}

function readStoredSession(storage) {
  try {
    return normalizeSession(JSON.parse(storage?.getItem?.(SUPABASE_SESSION_STORAGE_KEY) || 'null'));
  } catch {
    try { storage?.removeItem?.(SUPABASE_SESSION_STORAGE_KEY); } catch { /* no-op */ }
    return null;
  }
}

