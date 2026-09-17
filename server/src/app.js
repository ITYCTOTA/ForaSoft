import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";

import { RoomGateway } from "./socket/roomGateway.js";
import { RoomRegistry } from "./rooms/roomRegistry.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function getRuntimeConfig(env = process.env) {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: Number(env.PORT ?? 3000),
    publicOrigin: env.PUBLIC_ORIGIN ?? null,
    stunUrl: env.STUN_URL ?? "stun:stun.l.google.com:19302",
    logLevel: env.LOG_LEVEL ?? "info",
  };
}

export function createApp({
  env = process.env,
  staticDir = path.join(projectRoot, "client", "dist"),
} = {}) {
  const config = getRuntimeConfig(env);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.get("/healthz", (_request, response) =>
    response.status(200).json({ status: "ok" }),
  );
  app.get("/runtime-config", (_request, response) =>
    response.json({ stunUrl: config.stunUrl }),
  );
  app.use(express.static(staticDir, { index: "index.html" }));
  const sendSpa = (_request, response) =>
    response.sendFile(path.join(staticDir, "index.html"), (error) => {
      if (error && !response.headersSent)
        response.status(404).type("text").send("SPA build not found");
    });
  app.get("/room/:roomId", sendSpa);
  app.get(/^(?!\/healthz$|\/runtime-config$|\/socket\.io(?:\/|$)).*/, sendSpa);
  return { app, config };
}

export function createHttpServer(options = {}) {
  const { app, config } = createApp(options);
  const httpServer = createServer(app);
  const allowedOrigins = new Set(
    [
      config.publicOrigin,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ].filter(Boolean),
  );
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) =>
        callback(null, !origin || allowedOrigins.has(origin)),
    },
  });
  const registry = new RoomRegistry();
  const gateway = new RoomGateway({ io, registry }).register();
  return { app, config, httpServer, io, registry, gateway };
}

export function startServer(options = {}) {
  const server = createHttpServer(options);
  server.httpServer.listen(server.config.port, "0.0.0.0", () => {
    console.info(
      `Video Chat Room server listening on port ${server.config.port}`,
    );
  });
  return server;
}
