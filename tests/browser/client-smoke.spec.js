import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4174";

async function createContext(browser) {
  const context = await browser.newContext();
  await context.grantPermissions(
    ["camera", "microphone", "clipboard-read", "clipboard-write"],
    { origin },
  );
  return context;
}

async function joinFromInvite(page, inviteUrl, displayName) {
  await page.goto(inviteUrl);
  await page.getByLabel("Отображаемое имя").fill(displayName);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("status")).toContainText("Вы вошли в комнату.");
}

async function expectVideoTracks(page, count) {
  await expect.poll(async () => page.locator("video").count()).toBe(count);
  await expect
    .poll(async () =>
      page
        .locator("video")
        .evaluateAll((videos) =>
          videos.map((video) => video.srcObject?.getVideoTracks().length ?? 0),
        ),
    )
    .toEqual(Array(count).fill(1));
}

function selfTile(page, displayName) {
  return page.locator(".video-tile").filter({ hasText: `${displayName} (вы)` });
}

test("opens the React client with fake media-capable Chromium", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["camera", "microphone"], { origin });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Видеочат-комната" }),
  ).toBeVisible();
});

test("covers create, invite, duplicate names, chat, controls, late join and voluntary exit", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const creatorContext = await createContext(browser);
  const guestContext = await createContext(browser);
  const lateContext = await createContext(browser);
  const creator = await creatorContext.newPage();
  const guest = await guestContext.newPage();
  const late = await lateContext.newPage();

  try {
    await creator.goto("/");
    await creator.getByLabel("Отображаемое имя").fill("Алиса");
    await creator.getByRole("button", { name: "Создать комнату" }).click();
    await creator.getByRole("button", { name: "Войти" }).click();
    await expect(creator.getByRole("status")).toContainText(
      "Вы вошли в комнату.",
    );
    const inviteUrl = await creator.locator(".invite-url").textContent();
    expect(inviteUrl).toBe(creator.url());
    await creator.getByRole("button", { name: "Скопировать ссылку" }).click();
    await expect(creator.getByText("Ссылка скопирована.")).toBeVisible();

    await joinFromInvite(guest, inviteUrl, "Алиса");
    await expectVideoTracks(creator, 2);
    await expectVideoTracks(guest, 2);
    await expect(
      creator.locator(".participant-list li").filter({ hasText: "Алиса" }),
    ).toHaveCount(2);

    await guest.getByLabel("Сообщение").fill("Сообщение для позднего входа");
    await guest.getByRole("button", { name: "Отправить" }).click();
    const chatMessage = creator
      .locator(".messages li")
      .filter({ hasText: "Сообщение для позднего входа" });
    await expect(chatMessage).toBeVisible();
    await expect(chatMessage.locator("small")).toHaveText(/^\d{2}:\d{2}$/);

    await joinFromInvite(late, inviteUrl, "Поздний участник");
    await expect(late.getByText("Сообщение для позднего входа")).toBeVisible();
    await expectVideoTracks(late, 3);

    await creator.getByRole("button", { name: "Выключить микрофон" }).click();
    await expect(
      creator.getByRole("button", { name: "Включить микрофон" }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        selfTile(creator, "Алиса")
          .locator("video")
          .evaluate((video) => video.srcObject?.getAudioTracks()[0]?.enabled),
      )
      .toBe(false);
    await creator.getByRole("button", { name: "Выключить камеру" }).click();
    await expect(
      creator.getByRole("button", { name: "Включить камеру" }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        selfTile(creator, "Алиса")
          .locator("video")
          .evaluate((video) => video.srcObject?.getVideoTracks().length),
      )
      .toBe(0);
    await expect(guest.getByLabel("Нет видео: Алиса")).toBeVisible();
    await expect(
      guest
        .locator(".video-tile")
        .filter({ has: guest.getByLabel("Нет видео: Алиса") })
        .locator("video"),
    ).toHaveClass(/audio-only/);
    await creator.getByRole("button", { name: "Включить камеру" }).click();
    await expect
      .poll(async () =>
        selfTile(creator, "Алиса")
          .locator("video")
          .evaluate((video) => video.srcObject?.getVideoTracks().length),
      )
      .toBe(1);

    await guest.getByRole("button", { name: "Выйти" }).click();
    await expect(
      guest.getByRole("heading", { name: "Видеочат-комната" }),
    ).toBeVisible();
    await expect(guest.getByRole("alert")).toHaveCount(0);
    await expect
      .poll(async () => creator.locator(".video-tile").count())
      .toBe(2);
    await expect(creator.getByText("Алиса вышел(ла) из комнаты")).toBeVisible();
  } finally {
    await Promise.all([
      creatorContext.close(),
      guestContext.close(),
      lateContext.close(),
    ]);
  }
});

test("delivers a video track to every participant in a four-person room", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const roomId = `browser-media-${Date.now()}`;
  const names = ["Первый", "Второй", "Третий", "Четвёртый"];
  const contexts = await Promise.all(names.map(() => createContext(browser)));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));

  try {
    for (const [index, page] of pages.entries()) {
      await joinFromInvite(page, `/room/${roomId}`, names[index]);
    }
    await Promise.all(pages.map((page) => expectVideoTracks(page, 4)));
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
