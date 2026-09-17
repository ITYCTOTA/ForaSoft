import { once } from "node:events";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { connectTestSocket, startTestServer } from "./fixtures/server.js";

const sockets = new Set();

function connect(url) {
  const socket = connectTestSocket(url);
  sockets.add(socket);
  return socket;
}

function acknowledge(socket, event, payload = {}) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitFor(socket, event, predicate = () => true) {
  return new Promise((resolve) => {
    const handler = (payload) => {
      if (!predicate(payload)) return;
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function expectNoEvent(socket, event, predicate, waitMs = 150) {
  let received = null;
  const handler = (payload) => {
    if (predicate(payload)) received = payload;
  };
  socket.on(event, handler);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  socket.off(event, handler);
  expect(received).toBeNull();
}

async function disconnect(socket) {
  if (!socket.connected) return;
  const disconnected = once(socket, "disconnect");
  socket.disconnect();
  await disconnected;
}

describe("real Socket.io room regressions", () => {
  let testServer;

  beforeAll(async () => {
    testServer = await startTestServer();
  });

  afterEach(async () => {
    await Promise.all([...sockets].map(disconnect));
    sockets.clear();
  });

  afterAll(async () => {
    await testServer?.close();
  });

  it("atomically awards the final slot and permits duplicate display names in separate tabs", async () => {
    const roomId = "slot-race-room";
    const first = connect(testServer.url);
    const second = connect(testServer.url);
    const third = connect(testServer.url);
    const contenderA = connect(testServer.url);
    const contenderB = connect(testServer.url);

    const initial = await Promise.all([
      acknowledge(first, "room:join", {
        roomId,
        displayName: "Одинаковое имя",
      }),
      acknowledge(second, "room:join", {
        roomId,
        displayName: "Одинаковое имя",
      }),
      acknowledge(third, "room:join", { roomId, displayName: "Третий" }),
    ]);
    const race = await Promise.all([
      acknowledge(contenderA, "room:join", {
        roomId,
        displayName: "Четвёртый",
      }),
      acknowledge(contenderB, "room:join", { roomId, displayName: "Пятый" }),
    ]);

    expect(initial.every((result) => result.ok)).toBe(true);
    expect(initial[0].self.id).not.toBe(initial[1].self.id);
    expect(race.filter((result) => result.ok)).toHaveLength(1);
    expect(race.filter((result) => result.code === "ROOM_FULL")).toHaveLength(
      1,
    );
  });

  it("releases a disconnected participant slot and broadcasts one leave event", async () => {
    const roomId = "disconnect-release-room";
    const participants = Array.from({ length: 4 }, () =>
      connect(testServer.url),
    );
    const joined = await Promise.all(
      participants.map((socket, index) =>
        acknowledge(socket, "room:join", {
          roomId,
          displayName: `Участник ${index + 1}`,
        }),
      ),
    );
    const observer = participants[1];
    const left = waitFor(
      observer,
      "room:participant-left",
      (payload) => payload.participant.id === joined[0].self.id,
    );

    await disconnect(participants[0]);
    const replacement = connect(testServer.url);
    const replacementJoin = await acknowledge(replacement, "room:join", {
      roomId,
      displayName: "Новый участник",
    });

    expect((await left).participant).toEqual({
      id: joined[0].self.id,
      displayName: "Участник 1",
    });
    expect(replacementJoin.ok).toBe(true);
    expect(replacementJoin.participants).toHaveLength(4);
  });

  it("keeps chat and signaling strictly inside their room", async () => {
    const roomAFirst = connect(testServer.url);
    const roomASecond = connect(testServer.url);
    const roomBFirst = connect(testServer.url);
    const roomBSecond = connect(testServer.url);
    const [aFirst, aSecond, bFirst] = await Promise.all([
      acknowledge(roomAFirst, "room:join", {
        roomId: "isolation-a",
        displayName: "А-1",
      }),
      acknowledge(roomASecond, "room:join", {
        roomId: "isolation-a",
        displayName: "А-2",
      }),
      acknowledge(roomBFirst, "room:join", {
        roomId: "isolation-b",
        displayName: "Б-1",
      }),
      acknowledge(roomBSecond, "room:join", {
        roomId: "isolation-b",
        displayName: "Б-2",
      }),
    ]);
    const roomAChat = waitFor(
      roomASecond,
      "chat:message",
      (message) => message.type === "user" && message.text === "только для А",
    );
    const chatAck = await acknowledge(roomAFirst, "chat:send", {
      text: "только для А",
    });
    const offer = { type: "offer", sdp: "v=0\r\no=only-room-a" };
    const roomASignal = waitFor(roomASecond, "signal:offer");
    const signalAck = await acknowledge(roomAFirst, "signal:offer", {
      targetId: aSecond.self.id,
      sdp: offer,
    });

    expect(chatAck.ok).toBe(true);
    expect(await roomAChat).toMatchObject({
      author: { participantId: aFirst.self.id },
      text: "только для А",
    });
    expect(signalAck).toEqual({ ok: true });
    expect(await roomASignal).toEqual({ fromId: aFirst.self.id, sdp: offer });
    await expectNoEvent(
      roomBFirst,
      "chat:message",
      (message) => message.type === "user" && message.text === "только для А",
    );
    await expectNoEvent(roomBSecond, "signal:offer", () => true);
    expect(bFirst.self.id).not.toBe(aFirst.self.id);
  });

  it("returns the latest 500 messages to a late participant without duplicating its join event", async () => {
    const roomId = "history-room";
    const anchor = connect(testServer.url);
    const worker = connect(testServer.url);
    const anchorJoin = await acknowledge(anchor, "room:join", {
      roomId,
      displayName: "Постоянный участник",
    });

    for (let index = 0; index < 250; index += 1) {
      const joined = await acknowledge(worker, "room:join", {
        roomId,
        displayName: "Временный участник",
      });
      expect(joined.ok).toBe(true);
      expect(await acknowledge(worker, "room:leave")).toEqual({ ok: true });
    }

    const late = connect(testServer.url);
    const ownJoinEvent = waitFor(
      late,
      "chat:message",
      (message) =>
        message.type === "system" &&
        message.event === "participant-joined" &&
        message.participant.id !== anchorJoin.self.id,
    );
    const lateJoin = await acknowledge(late, "room:join", {
      roomId,
      displayName: "Поздний участник",
    });

    expect(lateJoin.ok).toBe(true);
    expect(lateJoin.messages).toHaveLength(500);
    expect(lateJoin.messages[0].event).toBe("participant-joined");
    expect(
      lateJoin.messages.some(
        (message) => message.participant?.id === lateJoin.self.id,
      ),
    ).toBe(false);
    const liveJoin = await ownJoinEvent;
    expect(liveJoin.participant.id).toBe(lateJoin.self.id);
    expect(
      lateJoin.messages.some((message) => message.id === liveJoin.id),
    ).toBe(false);
  }, 30_000);
});
