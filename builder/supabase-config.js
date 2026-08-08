const DEFAULT_CONFIG = Object.freeze({
  url: 'https://irgtpkqkeiacgtbewpzn.supabase.co',
  publishableKey: 'sb_publishable_nl7aTsLXfpK6XJ0EGBSmQQ_3WhoCp1_',
});

/**
 * Browser-safe Supabase configuration.
 *
 * A deployment may set window.LC_FORGE_SUPABASE_CONFIG before this module loads.
 * Only the project URL and Publishable key belong here. Database passwords,
 * Secret keys, service_role keys, and DIRECT_URL values must never be added.
 */
export function getSupabaseConfig(globalObject = globalThis) {
  const runtime = globalObject?.LC_FORGE_SUPABASE_CONFIG;
  return Object.freeze({
    url: String(runtime?.url || DEFAULT_CONFIG.url).trim().replace(/\/$/, ''),
    publishableKey: String(runtime?.publishableKey || DEFAULT_CONFIG.publishableKey).trim(),
  });
}

export const SUPABASE_PROJECT_URL = DEFAULT_CONFIG.url;

