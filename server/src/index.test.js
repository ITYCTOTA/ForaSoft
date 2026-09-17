import { describe, expect, it } from "vitest";

import { createApp, getRuntimeConfig } from "./app.js";

describe("HTTP composition root", () => {
  it("reads runtime settings", () => {
    expect(
      getRuntimeConfig({
        PORT: "4100",
        PUBLIC_ORIGIN: "https://example.test",
        STUN_URL: "stun:custom",
        NODE_ENV: "production",
        LOG_LEVEL: "warn",
      }),
    ).toEqual({
      port: 4100,
      publicOrigin: "https://example.test",
      stunUrl: "stun:custom",
      nodeEnv: "production",
      logLevel: "warn",
    });
  });

  it("serves health and browser-safe runtime config", async () => {
    const { app } = createApp({
      env: { STUN_URL: "stun:example.test" },
      staticDir: "missing-dist",
    });
    const listener = app.listen(0);
    await new Promise((resolve) => listener.once("listening", resolve));
    const address = listener.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${baseUrl}/healthz`);
    const config = await fetch(`${baseUrl}/runtime-config`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    expect(await config.json()).toEqual({ stunUrl: "stun:example.test" });
    await new Promise((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
