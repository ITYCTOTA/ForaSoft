import assert from "node:assert/strict";
import { once } from "node:events";

import { io } from "socket.io-client";

import { createHttpServer } from "../server/src/app.js";

const roomCount = positiveInteger(process.env.SOAK_ROOMS, 50);
const participantsPerRoom = positiveInteger(process.env.SOAK_PARTICIPANTS, 4);
const cycles = positiveInteger(process.env.SOAK_CYCLES, 3);
const durationMs = positiveInteger(process.env.SOAK_DURATION_MS, 0);

const app = createHttpServer({
  env: { ...process.env, PORT: "0", LOG_LEVEL: "silent" },
});
const sockets = new Set();
let peakHeapUsed = process.memoryUsage().heapUsed;
const startedAt = performance.now();

try {
  app.httpServer.listen(0, "127.0.0.1");
  await once(app.httpServer, "listening");
  const { port } = app.httpServer.address();
  const url = `http://127.0.0.1:${port}`;
  const memoryBefore = snapshotMemory();
  let completedCycles = 0;

  while (completedCycles < cycles || withinDuration()) {
    await runCycle(url, completedCycles);
    completedCycles += 1;
    assert.equal(app.registry.roomCount, 0, "all rooms must be removed");
    assert.equal(
      app.registry.participantCount,
      0,
      "all participants must be removed",
    );
    sampleMemory();
    if (!withinDuration() && completedCycles >= cycles) break;
  }

  if (global.gc) global.gc();
  const memoryAfter = snapshotMemory();
  const report = {
    profile: "socket-soak",
    rooms: roomCount,
    participantsPerRoom,
    completedCycles,
    durationMs: Math.round(performance.now() - startedAt),
    registryAfter: {
      rooms: app.registry.roomCount,
      participants: app.registry.participantCount,
    },
    memoryBytes: {
      beforeHeapUsed: memoryBefore.heapUsed,
      peakHeapUsed,
      afterHeapUsed: memoryAfter.heapUsed,
    },
    socketsRemaining: sockets.size,
  };
  console.log(JSON.stringify(report));
} finally {
  await Promise.all([...sockets].map(closeSocket));
  await app.shutdown();
  if (app.httpServer.listening)
    await new Promise((resolve, reject) =>
      app.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
}

async function runCycle(url, cycle) {
  const groups = await Promise.all(
    Array.from({ length: roomCount }, async (_, roomIndex) => {
      const members = await Promise.all(
        Array.from({ length: participantsPerRoom }, () => connectSocket(url)),
      );
      const joined = await Promise.all(
        members.map((socket, participantIndex) =>
          acknowledge(socket, "room:join", {
            roomId: `soak-${cycle}-${roomIndex}`,
            displayName: `P${participantIndex + 1}`,
          }),
        ),
      );
      assert.ok(joined.every((result) => result.ok), "all members must join");
      return members;
    }),
  );
  sampleMemory();
  await Promise.all(
    groups.flat().map(async (socket) => {
      assert.deepEqual(await acknowledge(socket, "room:leave"), { ok: true });
      await closeSocket(socket);
    }),
  );
}

async function connectSocket(url) {
  const socket = io(url, {
    autoConnect: true,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173" },
  });
  sockets.add(socket);
  await once(socket, "connect");
  return socket;
}

function acknowledge(socket, event, payload = {}) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function closeSocket(socket) {
  sockets.delete(socket);
  if (!socket.connected) {
    socket.close();
    return;
  }
  const disconnected = once(socket, "disconnect");
  socket.disconnect();
  await disconnected;
}

function snapshotMemory() {
  const memory = process.memoryUsage();
  peakHeapUsed = Math.max(peakHeapUsed, memory.heapUsed);
  return memory;
}

function sampleMemory() {
  snapshotMemory();
}

function withinDuration() {
  return durationMs > 0 && performance.now() - startedAt < durationMs;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
