import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const commitSha = 'b'.repeat(40);
const rawPrefix = `/cm5wxjmcpv-bit/Game-v2/${commitSha}/`;

test('draft preview loads exact commit content, selected scene, and isolated saves', async ({ page }) => {
  const rawRequests = [];
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith(rawPrefix)) {
      return route.fulfill({ status: 404, body: 'Unexpected repository request' });
    }
    const repositoryPath = decodeURIComponent(url.pathname.slice(rawPrefix.length));
    const absolutePath = path.resolve(repositoryPath);
    if (!absolutePath.startsWith(`${process.cwd()}${path.sep}`)) {
      return route.fulfill({ status: 403, body: 'Invalid path' });
    }
    rawRequests.push(repositoryPath);
    const body = await fs.readFile(absolutePath, 'utf8');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });

  await page.goto(`/preview.html?game=scene-demo&scene=fallback_room&previewCommit=${commitSha}&previewPr=44`);
  await expect(page.locator('#previewDetails')).toContainText('scene-demo › fallback_room');
  await expect(page.locator('#previewPrLink')).toHaveAttribute(
    'href',
    'https://github.com/cm5wxjmcpv-bit/Game-v2/pull/44',
  );
  await expect(page.locator('#new-game')).toBeVisible();
  await page.locator('#new-game').click();
  await page.locator('#class-opts button').first().click();
  await expect(page.locator('#context-panel')).toContainText('Scene: fallback_room');

  expect(rawRequests).toContain('games/scene-demo/game.json');
  expect(rawRequests).toContain('games/scene-demo/data/core.json');
  expect(rawRequests).toContain('games/scene-demo/data/towns/fallback_room.json');
  const saveKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(saveKeys).toContain(`pixel_engine_preview_save_${commitSha.slice(0, 12)}_scene-demo_slot_1`);
  expect(saveKeys).not.toContain('pixel_engine_save_scene-demo_slot_1');
});

test('draft preview rejects an untrusted commit value before loading game data', async ({ page }) => {
  const rawRequests = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://raw.githubusercontent.com/')) rawRequests.push(request.url());
  });

  await page.goto('/preview.html?game=scene-demo&previewCommit=main');
  await expect(page.locator('#overlay')).toContainText('Unable to Load Draft Preview');
  await expect(page.locator('#overlay')).toContainText('invalid or missing commit');
  expect(rawRequests).toEqual([]);
});
