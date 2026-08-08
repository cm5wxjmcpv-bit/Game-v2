import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../../', import.meta.url);

test('frontend configuration contains no database password or server key', async () => {
  const files = (await readdir(new URL('../../builder/', import.meta.url)))
    .filter((name) => name.endsWith('.js'));
  const source = (await Promise.all(files.map((name) => readFile(new URL(`../../builder/${name}`, import.meta.url), 'utf8')))).join('\n');
  assert.doesNotMatch(source, /sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\/[^\s"']+:[^\[\s"']+@/i);
  assert.doesNotMatch(source, /(?:service_role|secretKey)\s*[:=]\s*['"][^'"]+['"]/i);
});

test('migration enables RLS on every user table and installs private storage policies', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/202608080001_lc_forge_cloud_backend.sql', import.meta.url), 'utf8');
  for (const table of ['profiles', 'projects', 'project_members', 'workspace_drafts', 'testing_levels', 'project_assets', 'character_art']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /builder-assets/);
  assert.match(sql, /values\s*\(\s*'builder-assets'\s*,\s*'builder-assets'\s*,\s*false/i);
  assert.match(sql, /cloud_revision_conflict/);
  assert.match(sql, /owner_id_is_immutable/);
});
