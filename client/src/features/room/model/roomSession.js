import { io } from "socket.io-client";
import { ERROR_CODES, UI_MESSAGES } from "@video-chat-room/shared";

export class RoomSession {
  constructor({
    socketFactory = io,
    onState = () => {},
    leaveAckTimeoutMs = 2_000,
    ackTimeoutMs = 2_000,
  } = {}) {
    this.socket = socketFactory({ autoConnect: false, reconnection: false });
    this.onState = onState;
    this.leaveAckTimeoutMs = leaveAckTimeoutMs;
    this.ackTimeoutMs = ackTimeoutMs;
    this.attempt = 0;
    this.bound = false;
    this.suppressDisconnect = false;
    this.leaving = false;
    this.cleaned = false;
    this.pendingJoin = null;
    this.cleanupCallbacks = new Set();
  }

  registerCleanup(callback) {
    this.cleanupCallbacks.add(callback);
    return () => this.cleanupCallbacks.delete(callback);
  }

  join({ roomId, displayName }) {
    this.#cancelPendingJoin();
    const attempt = ++this.attempt;
    this.suppressDisconnect = false;
    this.#subscribe();
    return new Promise((resolve) => {
      let timer;
      let complete = false;
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off?.("connect", onConnect);
        this.socket.off?.("connect_error", onConnectError);
        if (this.pendingJoin?.attempt === attempt) this.pendingJoin = null;
      };
      const finish = (result) => {
        if (complete) return;
        complete = true;
        cleanup();
        if (attempt !== this.attempt || this.cleaned)
          return resolve({ ok: false, code: "JOIN_CANCELLED" });
        if (!result.ok) {
          this.suppressDisconnect = true;
          this.socket.disconnect();
          this.onState({
            status: "error",
            error: result.message,
            code: result.code,
          });
        } else this.onState({ status: "joined", ...result });
        resolve(result);
      };
      const cancel = () => {
        if (complete) return;
        complete = true;
        cleanup();
        resolve({ ok: false, code: "JOIN_CANCELLED" });
      };
      const onConnect = () =>
        this.socket.emit("room:join", { roomId, displayName }, finish);
      const onConnectError = () =>
        finish({
          ok: false,
          code: "SERVER_UNAVAILABLE",
          message: UI_MESSAGES.SERVER_DISCONNECTED,
        });
      this.pendingJoin = { attempt, cancel };
      this.socket.once("connect", onConnect);
      this.socket.once("connect_error", onConnectError);
      timer = setTimeout(
        () =>
          finish({
            ok: false,
            code: "SERVER_UNAVAILABLE",
            message: UI_MESSAGES.SERVER_DISCONNECTED,
          }),
        5_000,
      );
      this.socket.connect();
    });
  }

  async leave({ waitForAck = true } = {}) {
    if (this.leaving || this.cleaned) return;
    this.leaving = true;
    this.attempt += 1;
    this.#cancelPendingJoin();
    this.onState({ status: "leaving" });
    if (this.socket.connected && waitForAck) {
      await new Promise((resolve) => {
        let complete = false;
        const finish = () => {
          if (complete) return;
          complete = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, this.leaveAckTimeoutMs);
        this.socket.emit("room:leave", {}, finish);
      });
    } else if (this.socket.connected) this.socket.emit("room:leave", {});
    this.socket.disconnect();
    this.#finalize({ status: "idle" });
  }

  sendChat(text) {
    return this.#emitWithAck("chat:send", { text });
  }
  sendMediaState(state) {
    return this.#emitWithAck("media:state", state);
  }
  sendSignal(event, payload) {
    return this.#emitWithAck(event, payload);
  }

  #emitWithAck(event, payload) {
    return new Promise((resolve) => {
      let complete = false;
      const finish = (result) => {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(
        () =>
          finish({
            ok: false,
            code: "SERVER_UNAVAILABLE",
            message: UI_MESSAGES.SERVER_DISCONNECTED,
          }),
        this.ackTimeoutMs,
      );
      this.socket.emit(event, payload, finish);
    });
  }

  #finalize(state) {
    if (this.cleaned) return;
    this.#cancelPendingJoin();
    this.cleaned = true;
    for (const cleanup of this.cleanupCallbacks) cleanup();
    this.onState(state);
  }

  #event(state) {
    if (!this.cleaned) this.onState(state);
  }

  #subscribe() {
    if (this.bound) return;
    this.bound = true;
    this.socket.on("disconnect", () => {
      if (this.leaving) this.#finalize({ status: "idle" });
      else if (!this.suppressDisconnect)
        this.#finalize({
          status: "disconnected",
          error: UI_MESSAGES.SERVER_DISCONNECTED,
        });
    });
    this.socket.on("room:participant-joined", ({ participant }) =>
      this.#event({ status: "participant-joined", participant }),
    );
    this.socket.on("room:participant-left", ({ participantId, participant }) =>
      this.#event({
        status: "participant-left",
        participantId: participantId ?? participant?.id,
      }),
    );
    this.socket.on("room:media-state", (state) =>
      this.#event({ status: "media-state", ...state }),
    );
    this.socket.on("chat:message", (message) =>
      this.#event({ status: "chat-message", message }),
    );
    this.socket.on("signal:offer", (signal) =>
      this.#event({ status: "signal-offer", ...signal }),
    );
    this.socket.on("signal:answer", (signal) =>
      this.#event({ status: "signal-answer", ...signal }),
    );
    this.socket.on("signal:ice", (signal) =>
      this.#event({ status: "signal-ice", ...signal }),
    );
  }

  #cancelPendingJoin() {
    this.pendingJoin?.cancel();
  }
}

export { ERROR_CODES };
