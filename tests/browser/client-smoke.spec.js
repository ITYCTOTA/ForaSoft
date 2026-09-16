import { expect, test } from '@playwright/test'

test('opens the React client with fake media-capable Chromium', async ({ context, page }) => {
  await context.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:4173' })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Видеочат-комната' })).toBeVisible()
})
