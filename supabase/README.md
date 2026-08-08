# Supabase setup for L-C Forge

The backend is designed for the existing Supabase project:

```text
https://irgtpkqkeiacgtbewpzn.supabase.co
```

No database password or server key is required by the GitHub Pages browser application.

## 1. Run the migration

In the Supabase dashboard:

1. Open **SQL Editor**.
2. Create a new query.
3. Paste the complete contents of `supabase/migrations/202608080001_lc_forge_cloud_backend.sql`.
4. Choose **Run** once.

The migration creates:

- `profiles`
- `projects`
- `project_members`
- `workspace_drafts`
- `testing_levels`
- `project_assets`
- `character_art`
- revision/timestamp functions and triggers
- the private `builder-assets` Storage bucket
- table and Storage Row Level Security policies

It is idempotent for the initial setup and does not use an insecure `USING (true)` policy for private builder data.

## 2. Configure email/password authentication

In **Authentication → Providers**, keep Email enabled. For the first owner-only version, create the builder user in **Authentication → Users** or use the project's normal invitation process. The website currently provides Sign In and Sign Out; it does not expose public account registration.

Published games remain publicly playable without a builder login.

## 3. Add the browser-safe Publishable key

In Supabase:

1. Open **Project Settings → API Keys**.
2. Copy the **Publishable key** (preferred) for the project.
3. Open `builder/supabase-config.js`.
4. Set only the `publishableKey` string.

Example shape:

```js
const DEFAULT_CONFIG = Object.freeze({
  url: 'https://irgtpkqkeiacgtbewpzn.supabase.co',
  publishableKey: 'PASTE_THE_BROWSER_SAFE_PUBLISHABLE_KEY_HERE',
});
```

The Publishable key is expected to be visible in browser source. RLS is the security boundary.

Never add any of these values to `builder/supabase-config.js`, another frontend file, a Git commit, or a chat message:

- database password
- a completed PostgreSQL `DIRECT_URL`
- Supabase Secret key
- legacy `service_role` key

The supplied database connection string remains a template only:

```text
postgresql://postgres.irgtpkqkeiacgtbewpzn:[YOUR-PASSWORD]@aws-0-us-east-2.pooler.supabase.com:5432/postgres
```

## 4. Verify security

In **Database → Tables**, confirm RLS is enabled for every table listed above. In **Storage**, confirm `builder-assets` is private. The migration's tests also verify that every user table enables RLS, policies use `auth.uid()`, no private policy uses `USING (true)`, and no actual server credential exists in frontend source.

## 5. Use the builder

Open the Game Workspace or Testing Space and choose the Cloud status control in the header.

- Signed out: all established local behavior continues.
- Signed in: changes save locally first and then synchronize.
- Offline: work remains local and retries later.
- Conflict: both copies are preserved until the creator chooses one.
- Existing local data: choose **Import Local Data to Cloud**; originals remain local.

## Optional migration tooling

The SQL file is compatible with the normal Supabase migration folder layout. If the Supabase CLI is used later, authenticate and link the project outside repository files. Any CLI access token or database password must remain in the operator's private environment or credential store. No secret environment variable is required by the static GitHub Pages frontend.

