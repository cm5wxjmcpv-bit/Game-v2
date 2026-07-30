import { expect, test } from '@playwright/test';

test('Level Builder provides a visible return link to the Game Workspace', async ({ page }) => {
  await page.goto('/builder/');

  const backLink = page.getByRole('link', { name: 'Back to Game Workspace' });
  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute('href', 'workspace.html');

  await backLink.click();
  await expect(page).toHaveURL(/\/builder\/workspace\.html$/);
});
