import { io } from "socket.io-client";
import { ERROR_CODES, UI_MESSAGES } from "@video-chat-room/shared";

export class RoomSession {
  constructor({ socketFactory = io, onState = () => {} } = {}) {
    this.socket = socketFactory({ autoConnect: false, reconnection: false });
    this.onState = onState;
    this.attempt = 0;
    this.bound = false;
    this.suppressDisconnect = false;
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
  leave() {
    this.attempt += 1;
    if (this.socket.connected)
      this.socket.emit("room:leave", {}, () => this.socket.disconnect());
    else this.socket.disconnect();
    this.onState({ status: "idle" });
  }
  sendChat(text) {
    return new Promise((resolve) =>
      this.socket.emit("chat:send", { text }, resolve),
    );
  }
  sendSignal(event, payload) {
    return new Promise((resolve) => this.socket.emit(event, payload, resolve));
  }
  #subscribe() {
    if (this.bound) return;
    this.bound = true;
    this.socket.on("disconnect", () => {
      if (!this.suppressDisconnect)
        this.onState({
          status: "disconnected",
          error: UI_MESSAGES.SERVER_DISCONNECTED,
        });
    });
    this.socket.on("room:participant-joined", ({ participant }) =>
      this.onState({ status: "participant-joined", participant }),
    );
    this.socket.on("room:participant-left", ({ participantId, participant }) =>
      this.onState({
        status: "participant-left",
        participantId: participantId ?? participant?.id,
      }),
    );
    this.socket.on("room:media-state", (state) =>
      this.onState({ status: "media-state", ...state }),
    );
    this.socket.on("chat:message", (message) =>
      this.onState({ status: "chat-message", message }),
    );
    this.socket.on("signal:offer", (signal) =>
      this.onState({ status: "signal-offer", ...signal }),
    );
    this.socket.on("signal:answer", (signal) =>
      this.onState({ status: "signal-answer", ...signal }),
    );
    this.socket.on("signal:ice", (signal) =>
      this.onState({ status: "signal-ice", ...signal }),
    );
  }
}
export { ERROR_CODES };
