import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4174";
const messages = {
  denied:
    "Нет доступа к камере или микрофону. Вы можете продолжить без них и изменить разрешение в настройках браузера.",
  unavailable:
    "Камера или микрофон недоступны. Проверьте устройства в настройках браузера или ОС.",
  unsupported:
    "Ваш браузер не поддерживает видеозвонки WebRTC. Используйте актуальную версию Chrome, Firefox или Edge.",
  disconnected: "Соединение с сервером потеряно. Войдите снова.",
  full: "Комната заполнена.",
};

async function mediaContext(browser) {
  const context = await browser.newContext();
  await context.grantPermissions(["camera", "microphone"], { origin });
  return context;
}

async function join(page, roomUrl, displayName) {
  await page.goto(roomUrl);
  await page.getByLabel("Отображаемое имя").fill(displayName);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("status")).toContainText("Вы вошли в комнату.");
}

test("reports a full room and retries only after an explicit click", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const contexts = await Promise.all(Array.from({ length: 5 }, () => mediaContext(browser)));
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  try {
    await pages[0].goto("/");
    await pages[0].getByLabel("Отображаемое имя").fill("Участник 1");
    await pages[0].getByRole("button", { name: "Создать комнату" }).click();
    await pages[0].getByRole("button", { name: "Войти" }).click();
    await expect(pages[0].getByRole("status")).toBeVisible();
    const roomUrl = pages[0].url();
    for (let index = 1; index < 4; index += 1)
      await join(pages[index], roomUrl, `Участник ${index + 1}`);

    await pages[4].goto(roomUrl);
    await pages[4].getByLabel("Отображаемое имя").fill("Участник 5");
    await pages[4].getByRole("button", { name: "Войти" }).click();
    await expect(pages[4].getByRole("alert")).toHaveText(messages.full);
    await expect(pages[4].getByRole("button", { name: "Повторить вход" })).toBeVisible();

    await pages[3].getByRole("button", { name: "Выйти" }).click();
    await expect(pages[3]).toHaveURL(origin + "/");
    await pages[4].getByRole("button", { name: "Повторить вход" }).click();
    await expect(pages[4].getByRole("status")).toContainText("Вы вошли в комнату.");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("joins without media after denied or unavailable devices", async ({ browser }) => {
  for (const [name, errorName, expected] of [
    ["Нет разрешения", "NotAllowedError", messages.denied],
    ["Нет устройства", "NotFoundError", messages.unavailable],
  ]) {
    const context = await mediaContext(browser);
    const page = await context.newPage();
    try {
      await page.addInitScript((error) => {
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: () => Promise.reject(new DOMException("", error)),
          },
        });
      }, errorName);
      await page.goto(`/room/task31-media-${errorName}`);
      await page.getByLabel("Отображаемое имя").fill(name);
      await page.getByRole("button", { name: "Войти" }).click();
      await expect(page.getByRole("status")).toContainText("Вы вошли в комнату.");
      await expect(page.getByRole("alert")).toHaveText(expected);
    } finally {
      await context.close();
    }
  }
});

test("blocks WebRTC-unsupported browser before opening a socket", async ({ browser }) => {
  const context = await mediaContext(browser);
  const page = await context.newPage();
  let socketRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/socket.io/")) socketRequests += 1;
  });
  try {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, "RTCPeerConnection", {
        configurable: true,
        value: undefined,
      });
    });
    await page.goto("/room/task31-no-webrtc");
    await page.getByLabel("Отображаемое имя").fill("Анна");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("alert")).toHaveText(messages.unsupported);
    await page.waitForTimeout(500);
    expect(socketRequests).toBe(0);
  } finally {
    await context.close();
  }
});

test("server failure is final until the user explicitly tries to enter again", async ({
  browser,
}) => {
  const context = await mediaContext(browser);
  await context.route("**/socket.io/**", (route) => route.abort());
  const page = await context.newPage();
  try {
    await page.goto("/room/task31-server-unavailable");
    await page.getByLabel("Отображаемое имя").fill("Анна");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("alert")).toHaveText(messages.disconnected);
    await page.waitForTimeout(750);
    await expect(page.getByRole("button", { name: "Войти" })).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("network loss releases the local room and does not rejoin when connectivity returns", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const firstContext = await mediaContext(browser);
  const secondContext = await mediaContext(browser);
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await first.goto("/");
    await first.getByLabel("Отображаемое имя").fill("Первый");
    await first.getByRole("button", { name: "Создать комнату" }).click();
    await first.getByRole("button", { name: "Войти" }).click();
    await expect(first.getByRole("status")).toBeVisible();
    await join(second, first.url(), "Второй");
    await expect(first.locator(".video-tile")).toHaveCount(2);

    await secondContext.setOffline(true);
    await expect(second.getByRole("alert")).toHaveText(messages.disconnected);
    await expect(first.locator(".video-tile")).toHaveCount(1);
    await secondContext.setOffline(false);
    await second.waitForTimeout(750);
    await expect(second.getByRole("status")).toHaveCount(0);
    await expect(first.getByRole("status")).toContainText("Вы вошли в комнату.");
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});

test("reload forgets the room session and renders user text safely", async ({ browser }) => {
  const context = await mediaContext(browser);
  const page = await context.newPage();
  try {
    await page.goto("/");
    await page.getByLabel("Отображаемое имя").fill("Анна");
    await page.getByRole("button", { name: "Создать комнату" }).click();
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await page.getByPlaceholder("Сообщение").fill("<img src=x onerror=alert(1)>");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    await expect(page.locator(".chat-panel img")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByLabel("Отображаемое имя")).toHaveValue("");
    await expect
      .poll(() => page.evaluate(() => localStorage.length))
      .toBe(0);
  } finally {
    await context.close();
  }
});

test("shows the explicit remote-audio gesture after autoplay rejection", async ({ browser }) => {
  const senderContext = await mediaContext(browser);
  const receiverContext = await mediaContext(browser);
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  try {
    await receiver.addInitScript(() => {
      globalThis.__allowRemotePlayback = false;
      globalThis.HTMLMediaElement.prototype.play = function play() {
        return this.muted || globalThis.__allowRemotePlayback
          ? Promise.resolve()
          : Promise.reject(new DOMException("", "NotAllowedError"));
      };
    });
    await sender.goto("/");
    await sender.getByLabel("Отображаемое имя").fill("Отправитель");
    await sender.getByRole("button", { name: "Создать комнату" }).click();
    await sender.getByRole("button", { name: "Войти" }).click();
    await expect(sender.getByRole("status")).toBeVisible();
    await join(receiver, sender.url(), "Получатель");
    await expect(receiver.getByRole("button", { name: "Включить звук" })).toBeVisible();
    await receiver.evaluate(() => {
      globalThis.__allowRemotePlayback = true;
    });
    await receiver.getByRole("button", { name: "Включить звук" }).click();
    await expect(receiver.getByRole("button", { name: "Включить звук" })).toHaveCount(0);
  } finally {
    await Promise.all([senderContext.close(), receiverContext.close()]);
  }
});

test("leaves no session behind when the page ends during media acquisition", async ({
  browser,
}) => {
  const context = await mediaContext(browser);
  const page = await context.newPage();
  let socketRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/socket.io/")) socketRequests += 1;
  });
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: () => new Promise(() => {}) },
      });
    });
    await page.goto("/room/task31-pending-media");
    await page.getByLabel("Отображаемое имя").fill("Анна");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("button", { name: "Подключение..." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Отображаемое имя")).toHaveValue("");
    expect(socketRequests).toBe(0);
  } finally {
    await context.close();
  }
});
