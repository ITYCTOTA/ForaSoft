import { request as httpRequest } from "node:http";

import { describe, expect, it } from "vitest";
import { io as createSocket } from "socket.io-client";

import { createApp, createHttpServer, getRuntimeConfig } from "./app.js";

async function listen(server) {
  server.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function connect(url, origin) {
  return createSocket(url, {
    forceNew: true,
    reconnection: false,
    timeout: 500,
    transports: ["websocket"],
    extraHeaders: { Origin: origin },
  });
}

function getWithoutOrigin(url, host) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      { headers: { Host: host } },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end();
  });
}

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

  it("sets the production CSP and HSTS from a normalized PUBLIC_ORIGIN", async () => {
    const { app } = createApp({
      env: {
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "https://video.example.test/some-path",
      },
      staticDir: "missing-dist",
    });
    const listener = app.listen(0);
    await new Promise((resolve) => listener.once("listening", resolve));
    const address = listener.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);

    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'; connect-src 'self' wss://video.example.test; media-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    await new Promise((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("keeps localhost permissions explicit in development", async () => {
    const { app } = createApp({ staticDir: "missing-dist" });
    const listener = app.listen(0);
    await new Promise((resolve) => listener.once("listening", resolve));
    const address = listener.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);

    expect(response.headers.get("strict-transport-security")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain(
      "ws://localhost:5173 ws://127.0.0.1:5173 ws://localhost:4173 ws://127.0.0.1:4173",
    );
    await new Promise((resolve, reject) =>
      listener.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("allows same-origin polling without Origin and rejects a disallowed Origin", async () => {
    const { httpServer, io } = createHttpServer({
      env: {
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "https://video.example.test",
      },
      staticDir: "missing-dist",
    });
    const url = await listen(httpServer);
    const allowed = connect(url, "https://video.example.test");
    const rejected = connect(url, "https://attacker.example.test");
    const rejectedHandshake = new Promise((resolve, reject) => {
      rejected.once("connect_error", resolve);
      rejected.once("connect", () => reject(new Error("must not connect")));
    });
    try {
      await new Promise((resolve, reject) => {
        allowed.once("connect", resolve);
        allowed.once("connect_error", reject);
      });
      const polling = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
        headers: { Origin: "https://attacker.example.test" },
      });
      const sameOriginPolling = await getWithoutOrigin(
        `${url}/socket.io/?EIO=4&transport=polling`,
        "video.example.test",
      );
      expect(polling.status).toBe(403);
      expect(sameOriginPolling).toBe(200);
      await rejectedHandshake;
      expect(allowed.connected).toBe(true);
      expect(rejected.connected).toBe(false);
    } finally {
      allowed.disconnect();
      rejected.disconnect();
      await new Promise((resolve) => io.close(resolve));
    }
  });

  it("stops observability while shutting down the Socket.io server", async () => {
    let stopped = 0;
    const observability = {
      record() {},
      error() {},
      info() {},
      stop() {
        stopped += 1;
      },
    };
    const server = createHttpServer({
      staticDir: "missing-dist",
      observability,
    });
    server.httpServer.listen(0);
    await new Promise((resolve) =>
      server.httpServer.once("listening", resolve),
    );

    await server.shutdown();

    expect(stopped).toBe(1);
  });
});
