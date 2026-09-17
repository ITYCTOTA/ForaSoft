import { io } from "socket.io-client";
import { ERROR_CODES, UI_MESSAGES } from "@video-chat-room/shared";

export class RoomSession {
  constructor({
    socketFactory = io,
    onState = () => {},
    leaveAckTimeoutMs = 2_000,
  } = {}) {
    this.socket = socketFactory({ autoConnect: false, reconnection: false });
    this.onState = onState;
    this.leaveAckTimeoutMs = leaveAckTimeoutMs;
    this.attempt = 0;
    this.bound = false;
    this.suppressDisconnect = false;
    this.leaving = false;
    this.cleaned = false;
    this.cleanupCallbacks = new Set();
  }

  registerCleanup(callback) {
    this.cleanupCallbacks.add(callback);
    return () => this.cleanupCallbacks.delete(callback);
  }

  join({ roomId, displayName }) {
    const attempt = ++this.attempt;
    this.suppressDisconnect = false;
    this.#subscribe();
    return new Promise((resolve) => {
      let timer;
      const finish = (result) => {
        if (attempt !== this.attempt) return;
        clearTimeout(timer);
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
      this.socket.once("connect", () =>
        this.socket.emit("room:join", { roomId, displayName }, finish),
      );
      this.socket.once("connect_error", () =>
        finish({
          ok: false,
          code: "SERVER_UNAVAILABLE",
          message: UI_MESSAGES.SERVER_DISCONNECTED,
        }),
      );
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
    return new Promise((resolve) =>
      this.socket.emit("chat:send", { text }, resolve),
    );
  }
  sendMediaState(state) {
    return new Promise((resolve) =>
      this.socket.emit("media:state", state, resolve),
    );
  }
  sendSignal(event, payload) {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }

  #finalize(state) {
    if (this.cleaned) return;
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
}

export { ERROR_CODES };
