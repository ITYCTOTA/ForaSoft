import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

import express from "express";
import { Server } from "socket.io";

import { ServerObservability } from "./observability.js";
import { RoomGateway } from "./socket/roomGateway.js";
import { RoomRegistry } from "./rooms/roomRegistry.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const DEVELOPMENT_ORIGINS = Object.freeze([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

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
  app.use(createSecurityHeaders(config));
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
  const {
    observability: suppliedObservability,
    observabilityOptions,
    ...appOptions
  } = options;
  const { app, config } = createApp(appOptions);
  const httpServer = createServer(app);
  const allowedOrigins = getAllowedOrigins(config);
  const isAllowedOrigin = (origin) =>
    typeof origin === "string"
      ? allowedOrigins.has(origin)
      : config.nodeEnv !== "production";
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    },
    allowRequest: (request, callback) =>
      callback(null, isAllowedOrigin(request.headers.origin)),
  });
  const registry = new RoomRegistry();
  const observability =
    suppliedObservability ??
    new ServerObservability({
      registry,
      logLevel: config.logLevel,
      ...observabilityOptions,
    });
  const gateway = new RoomGateway({ io, registry, observability }).register();
  let shutdownPromise;
  const shutdown = () => {
    if (!shutdownPromise) {
      observability.stop();
      shutdownPromise = new Promise((resolve, reject) =>
        io.close((error) => (error ? reject(error) : resolve())),
      );
    }
    return shutdownPromise;
  };
  return {
    app,
    config,
    httpServer,
    io,
    registry,
    gateway,
    observability,
    shutdown,
  };
}

export function startServer(options = {}) {
  const server = createHttpServer(options);
  server.httpServer.listen(server.config.port, "0.0.0.0", () => {
    server.observability.start();
    server.observability.info("server_started");
  });
  return server;
}

function getAllowedOrigins(config) {
  const origins = new Set();
  const publicOrigin = normalizeOrigin(config.publicOrigin);
  if (publicOrigin) origins.add(publicOrigin);
  if (config.nodeEnv !== "production") {
    for (const origin of DEVELOPMENT_ORIGINS) origins.add(origin);
  }
  return origins;
}

function createSecurityHeaders(config) {
  const isProduction = config.nodeEnv === "production";
  const publicOrigin = normalizeOrigin(config.publicOrigin);
  const connectSources = ["'self'"];
  if (isProduction && publicOrigin) {
    connectSources.push(toWebSocketOrigin(publicOrigin));
  }
  if (!isProduction) {
    connectSources.push(
      "ws://localhost:5173",
      "ws://127.0.0.1:5173",
      "ws://localhost:4173",
      "ws://127.0.0.1:4173",
    );
  }
  const contentSecurityPolicy = [
    "default-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'self' blob:",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return (_request, response, next) => {
    response.setHeader("Content-Security-Policy", contentSecurityPolicy);
    if (isProduction) {
      response.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    }
    next();
  };
}

function normalizeOrigin(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin) {
  const url = new URL(origin);
  return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
}
