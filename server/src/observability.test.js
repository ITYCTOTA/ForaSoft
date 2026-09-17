import { describe, expect, it } from "vitest";

import { ServerObservability } from "./observability.js";

describe("ServerObservability", () => {
  it("writes a privacy-safe snapshot every minute and clears its timer", () => {
    const stdout = [];
    const stderr = [];
    const timers = [];
    const cleared = [];
    const registry = {
      roomCount: 2,
      participantCount: 3,
      rooms: new Map([
        ["room-id", { displayName: "Алиса", text: "секрет", sdp: "v=0" }],
      ]),
    };
    const observability = new ServerObservability({
      registry,
      clock: () => new Date("2026-01-02T03:04:05.000Z"),
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      setIntervalFn: (callback, intervalMs) => {
        const timer = { callback, intervalMs };
        timers.push(timer);
        return timer;
      },
      clearIntervalFn: (timer) => cleared.push(timer),
    });

    observability.record("socketConnects");
    observability.error("INVALID_MESSAGE", "validationErrors");
    observability.start();
    observability.start();

    expect(timers).toHaveLength(1);
    expect(timers[0].intervalMs).toBe(60_000);
    timers[0].callback();

    expect(JSON.parse(stdout[0])).toEqual({
      timestamp: "2026-01-02T03:04:05.000Z",
      level: "info",
      event: "metrics",
      activeRooms: 2,
      activeParticipants: 3,
      counters: {
        roomFull: 0,
        validationErrors: 1,
        socketConnects: 1,
        socketDisconnects: 0,
        relayErrors: 0,
        rateLimited: 0,
      },
    });
    expect(stdout[0]).not.toContain("Алиса");
    expect(stdout[0]).not.toContain("секрет");
    expect(stdout[0]).not.toContain("v=0");
    expect(stderr[0]).toBe(
      '{"timestamp":"2026-01-02T03:04:05.000Z","level":"error","event":"server_error","code":"INVALID_MESSAGE"}',
    );

    observability.stop();
    observability.stop();
    expect(cleared).toEqual([timers[0]]);
  });

  it("honours LOG_LEVEL while keeping error output structured", () => {
    const lines = [];
    const observability = new ServerObservability({
      registry: { roomCount: 0, participantCount: 0 },
      logLevel: "error",
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });

    observability.writeSnapshot();
    observability.error("INVALID_SIGNAL_TARGET");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "error",
      code: "INVALID_SIGNAL_TARGET",
    });
  });
});
