import { expect, test } from '@playwright/test'

test('opens the React client with fake media-capable Chromium', async ({ context, page }) => {
  await context.grantPermissions(['camera', 'microphone'], { origin: 'http://127.0.0.1:4173' })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Видеочат-комната' })).toBeVisible()
})

test('delivers a video track to every participant in a four-person room', async ({ browser }) => {
  test.setTimeout(30_000)
  const roomId = `browser-media-${Date.now()}`
  const names = ['Первый', 'Второй', 'Третий', 'Четвёртый']
  const contexts = await Promise.all(names.map(() => browser.newContext()))
  const origin = 'http://127.0.0.1:4173'
  await Promise.all(contexts.map((context) =>
    context.grantPermissions(['camera', 'microphone'], { origin }),
  ))
  const pages = await Promise.all(contexts.map((context) => context.newPage()))

  try {
    for (const [index, page] of pages.entries()) {
      await page.goto(`/room/${roomId}`)
      await page.getByLabel('Отображаемое имя').fill(names[index])
      await page.getByRole('button', { name: 'Войти' }).click()
      await expect(page.getByRole('status')).toContainText('Вы вошли в комнату.')
    }

    await Promise.all(pages.map(async (page) => {
      await expect.poll(async () => page.locator('video').count()).toBe(4)
      await expect.poll(async () => page.locator('video').evaluateAll((videos) => videos.map((video) => video.srcObject?.getVideoTracks().length ?? 0)))
        .toEqual([1, 1, 1, 1])
    }))
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
