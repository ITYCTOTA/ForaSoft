import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:4174";

async function auditedContext(browser) {
  const context = await browser.newContext();
  await context.grantPermissions(["camera", "microphone"], { origin });
  await context.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const tracks = [];
    const connections = [];
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await getUserMedia(...args);
      tracks.push(...stream.getTracks());
      return stream;
    };
    const NativePeerConnection = globalThis.RTCPeerConnection;
    class AuditedPeerConnection extends NativePeerConnection {
      constructor(...args) {
        super(...args);
        connections.push(this);
      }
    }
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: AuditedPeerConnection,
    });
    globalThis.__mediaSoakAudit = { tracks, connections };
  });
  return context;
}

async function audit(page) {
  return page.evaluate(() => {
    const { connections, tracks } = globalThis.__mediaSoakAudit;
    return {
      connectionCount: connections.length,
      openConnections: connections.filter(
        (connection) => connection.connectionState !== "closed",
      ).length,
      liveTracks: tracks.filter((track) => track.readyState !== "ended").length,
      trackCount: tracks.length,
    };
  });
}

test("releases peer connections and local tracks after repeated two-peer calls", async ({
  browser,
}) => {
  test.setTimeout(30_000);
  const creatorContext = await auditedContext(browser);
  const guestContext = await auditedContext(browser);
  const creator = await creatorContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await creator.goto("/");
    await guest.goto("/");

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await creator.getByLabel("Отображаемое имя").fill("Создатель");
      await creator.getByRole("button", { name: "Создать комнату" }).click();
      await creator.getByRole("button", { name: "Войти" }).click();
      await expect(creator.getByRole("status")).toBeVisible();

      await guest.getByLabel("Отображаемое имя").fill("Гость");
      await guest
        .getByLabel("Идентификатор комнаты")
        .fill(new URL(creator.url()).pathname.split("/").at(-1));
      await guest.getByRole("button", { name: "Войти" }).click();
      await guest.getByRole("button", { name: "Войти" }).click();
      await expect(guest.getByRole("status")).toBeVisible();
      await expect(creator.locator(".video-tile")).toHaveCount(2);

      await creator.getByRole("button", { name: "Выйти" }).click();
      await guest.getByRole("button", { name: "Выйти" }).click();
      await expect(creator.getByRole("heading", { name: "Видеочат-комната" })).toBeVisible();
      await expect(guest.getByRole("heading", { name: "Видеочат-комната" })).toBeVisible();
    }

    await expect.poll(() => audit(creator)).toMatchObject({
      connectionCount: 5,
      openConnections: 0,
      liveTracks: 0,
      trackCount: 10,
    });
    await expect.poll(() => audit(guest)).toMatchObject({
      connectionCount: 5,
      openConnections: 0,
      liveTracks: 0,
      trackCount: 10,
    });
  } finally {
    await Promise.all([creatorContext.close(), guestContext.close()]);
  }
});
