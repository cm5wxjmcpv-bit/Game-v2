import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPABASE_SESSION_STORAGE_KEY,
  createSupabaseClient,
  isSupabaseConfigured,
  normalizeSupabaseConfig,
} from '../../builder/supabase-client.js';

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
  };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return payload === null ? '' : JSON.stringify(payload); },
  };
}

const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_browser_safe' };

test('Supabase configuration accepts only an HTTPS project URL and browser key', () => {
  assert.deepEqual(normalizeSupabaseConfig(config), config);
  assert.equal(isSupabaseConfigured(config), true);
  assert.equal(isSupabaseConfigured({ ...config, publishableKey: '' }), false);
  assert.throws(() => normalizeSupabaseConfig({ url: 'http://example.supabase.co', publishableKey: 'x' }), /HTTPS/);
  assert.throws(() => normalizeSupabaseConfig({ url: 'https://example.com', publishableKey: 'x' }), /supabase\.co/);
});

test('signed-out state signs in, persists the session, and signs out without logging credentials', async () => {
  const calls = [];
  const local = storage();
  const client = createSupabaseClient({
    config,
    storage: local,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/token?grant_type=password')) {
        return response(200, {
          access_token: 'user-access-token',
          refresh_token: 'user-refresh-token',
          expires_in: 3600,
          user: { id: 'user-1', email: 'builder@example.com' },
        });
      }
      if (url.endsWith('/logout')) return response(204, null);
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(await client.initialize(), null);
  const signedIn = await client.signInWithPassword({ email: 'builder@example.com', password: 'private-password' });
  assert.equal(signedIn.user.id, 'user-1');
  assert.equal(JSON.parse(local.getItem(SUPABASE_SESSION_STORAGE_KEY)).access_token, 'user-access-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'builder@example.com', password: 'private-password' });

  await client.signOut();
  assert.equal(client.getSession(), null);
  assert.equal(local.getItem(SUPABASE_SESSION_STORAGE_KEY), null);
});

test('an expired stored session refreshes before an authenticated REST request', async () => {
  const local = storage({
    [SUPABASE_SESSION_STORAGE_KEY]: JSON.stringify({
      access_token: 'expired-token',
      refresh_token: 'refresh-token',
      expires_at: 5,
      user: { id: 'user-1' },
    }),
  });
  const calls = [];
  const client = createSupabaseClient({
    config,
    storage: local,
    now: () => 10_000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('grant_type=refresh_token')) {
        return response(200, {
          access_token: 'fresh-token',
          refresh_token: 'fresh-refresh',
          expires_at: 9999,
          user: { id: 'user-1' },
        });
      }
      if (url.includes('/rest/v1/projects')) return response(200, []);
      throw new Error(`Unexpected request: ${url}`);
    },
  });

  await client.rest('projects?select=*');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fresh-token');
});

test('authentication errors remain useful without exposing the supplied password', async () => {
  const client = createSupabaseClient({
    config,
    storage: storage(),
    fetchImpl: async () => response(400, { error_description: 'Invalid login credentials' }),
  });
  await assert.rejects(
    client.signInWithPassword({ email: 'builder@example.com', password: 'do-not-repeat-this' }),
    (error) => error.status === 400 && !error.message.includes('do-not-repeat-this'),
  );
});

