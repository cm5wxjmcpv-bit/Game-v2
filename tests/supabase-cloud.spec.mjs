import { expect, test } from '@playwright/test';

const SUPABASE_URL = 'https://irgtpkqkeiacgtbewpzn.supabase.co';

test('workspace explains the one missing browser-safe key without exposing a secret field', async ({ page }) => {
  await page.addInitScript(() => {
    window.LC_FORGE_SUPABASE_CONFIG = {
      url: 'https://irgtpkqkeiacgtbewpzn.supabase.co',
      publishableKey: ' ',
    };
  });
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#cloudAccountButtonLabel')).toHaveText('Cloud: Setup needed');
  await page.locator('#cloudAccountButton').click();
  await expect(page.locator('#cloudSetupPanel')).toContainText('Project Settings → API Keys');
  await expect(page.locator('#cloudSetupPanel')).toContainText('Publishable key');
  await expect(page.locator('#cloudSetupPanel')).toContainText('Never place the database password');
  await expect(page.locator('#cloudSignInForm')).toBeHidden();
  await expect(page.locator('input[name*="secret" i], input[name*="service" i], input[name*="direct" i]')).toHaveCount(0);
});

test('builder can sign in and sign out through mocked Supabase email authentication', async ({ page }) => {
  await page.addInitScript(() => {
    window.LC_FORGE_SUPABASE_CONFIG = {
      url: 'https://irgtpkqkeiacgtbewpzn.supabase.co',
      publishableKey: 'sb_publishable_browser_test',
    };
  });
  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/auth/v1/token?grant_type=password')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-user-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          user: { id: '11111111-1111-4111-8111-111111111111', email: 'builder@example.com' },
        }),
      });
      return;
    }
    if (url.endsWith('/auth/v1/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (url.includes('/rest/v1/projects') && request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: '22222222-2222-4222-8222-222222222222',
          owner_id: '11111111-1111-4111-8111-111111111111',
          game_package_id: 'scene-demo',
          stable_engine_id: 'scene-demo',
          name: 'Generic Scene Demo',
          revision: 1,
        }]),
      });
      return;
    }
    if (url.includes('/rest/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.abort();
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#cloudAccountButton').click();
  await page.locator('#cloudEmailInput').fill('builder@example.com');
  await page.locator('#cloudPasswordInput').fill('private-password');
  await page.locator('#cloudSignInButton').click();
  await expect(page.locator('#cloudSignedInPanel')).toBeVisible();
  await expect(page.locator('#cloudSignedInEmail')).toHaveText('builder@example.com');
  await expect(page.locator('#cloudDetailedStatus')).toContainText(/Cloud|cloud draft/i);

  await page.locator('#cloudSignOutButton').click();
  await expect(page.locator('#cloudSignInForm')).toBeVisible();
  await expect(page.locator('#cloudAccountButtonLabel')).toHaveText('Cloud: Signed out');
});

test('failed or expired authentication shows a safe error and leaves local builder access available', async ({ page }) => {
  await page.addInitScript(() => {
    window.LC_FORGE_SUPABASE_CONFIG = {
      url: 'https://irgtpkqkeiacgtbewpzn.supabase.co',
      publishableKey: 'sb_publishable_browser_test',
    };
  });
  await page.route(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error_description: 'Invalid login credentials' }),
  }));

  await page.goto('/builder/workspace.html?game=scene-demo');
  await page.locator('#cloudAccountButton').click();
  await page.locator('#cloudEmailInput').fill('builder@example.com');
  await page.locator('#cloudPasswordInput').fill('wrong-password');
  await page.locator('#cloudSignInButton').click();
  await expect(page.locator('#cloudAccountError')).toContainText('Sign-in failed');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#saveDraftBtn')).toBeEnabled();
});

test('workspace remembers the current tool tab across actions and reloads', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceWeaponTabBtn').click();
  await expect(page.locator('#workspaceWeaponTab')).toBeVisible();
  await page.locator('#wm-new').click();
  await expect(page.locator('#workspaceWeaponTab')).toBeVisible();
  await expect(page.locator('.workspace-tab.active')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#workspaceWeaponTab')).toBeVisible();

  const family = page.locator('#wm-family');
  await family.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await family.evaluate((select) => {
    select.value = 'ranged';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(Math.max(0, before - 120));
});
