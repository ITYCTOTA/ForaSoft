import { randomUUID } from "node:crypto";

import { ERROR_CODES, LIMITS } from "@video-chat-room/shared";

import {
  appendMessage,
  createSystemMessage,
  createUserMessage,
  snapshotRoom,
} from "./messageHistory.js";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * In-memory room registry. The join operation is synchronous so the capacity
 * check and participant insertion cannot be interleaved by another handler.
 */
export class RoomRegistry {
  /**
   * @param {{ maxParticipants?: number, idFactory?: () => string, clock?: () => Date }} [options]
   */
  constructor({
    maxParticipants = LIMITS.MAX_PARTICIPANTS,
    idFactory = randomUUID,
    clock = () => new Date(),
  } = {}) {
    this.maxParticipants = maxParticipants;
    this.idFactory = idFactory;
    this.clock = clock;
    /** @type {Map<string, object>} */
    this.rooms = new Map();
  }

  /**
   * Atomically add a participant. A missing room is only inserted after the
   * participant has passed every check and has been created successfully.
   * @param {{ roomId: string, displayName: string }} input
   * @returns {{ ok: true, room: object, participant: import('@video-chat-room/shared').Participant } | { ok: false, code: string, room: null, participant: null }}
   */
  join({ roomId, displayName }) {
    const currentRoom = this.rooms.get(roomId);
    if (currentRoom && currentRoom.participants.size >= this.maxParticipants) {
      return {
        ok: false,
        code: ERROR_CODES.ROOM_FULL,
        room: null,
        participant: null,
      };
    }

    const participant = {
      id: this.#createUniqueParticipantId(currentRoom),
      displayName,
      audioEnabled: false,
      videoEnabled: false,
      joinedAt: this.clock().toISOString(),
    };
    const room = currentRoom ?? {
      id: roomId,
      participants: new Map(),
      messages: [],
    };

    room.participants.set(participant.id, participant);
    if (!currentRoom) {
      this.rooms.set(roomId, room);
    }

    return { ok: true, room, participant };
  }

  /** @param {string} roomId */
  get(roomId) {
    return this.rooms.get(roomId);
  }

  /** @param {string} roomId */
  has(roomId) {
    return this.rooms.has(roomId);
  }

  get roomCount() {
    return this.rooms.size;
  }

  get participantCount() {
    let count = 0;
    for (const room of this.rooms.values()) count += room.participants.size;
    return count;
  }

  createUserMessage(input) {
    return createUserMessage({
      ...input,
      idFactory: this.idFactory,
      clock: this.clock,
    });
  }

  createSystemMessage(input) {
    return createSystemMessage({
      ...input,
      idFactory: this.idFactory,
      clock: this.clock,
    });
  }

  appendMessage(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return appendMessage(room, message);
  }

  snapshot(roomId) {
    const room = this.rooms.get(roomId);
    return room ? snapshotRoom(room) : null;
  }

  leave(roomId, participantId) {
    const room = this.rooms.get(roomId);
    const participant = room?.participants.get(participantId);
    if (!room || !participant)
      return { ok: false, room: null, participant: null, message: null };

    const snapshot = {
      id: participant.id,
      displayName: participant.displayName,
    };
    room.participants.delete(participantId);
    const message = this.createSystemMessage({
      event: "participant-left",
      participant: snapshot,
    });
    appendMessage(room, message);
    if (room.participants.size === 0) this.rooms.delete(roomId);
    return {
      ok: true,
      room: room.participants.size > 0 ? room : null,
      participant: snapshot,
      message,
    };
  }

  updateMediaState(roomId, participantId, state) {
    const participant = this.rooms.get(roomId)?.participants.get(participantId);
    if (!participant) return null;
    participant.audioEnabled = state.audioEnabled;
    participant.videoEnabled = state.videoEnabled;
    return {
      id: participant.id,
      audioEnabled: participant.audioEnabled,
      videoEnabled: participant.videoEnabled,
    };
  }

  #createUniqueParticipantId(room) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const id = this.idFactory();
      if (!UUID_V4_PATTERN.test(id)) {
        throw new TypeError("idFactory must return a UUID v4");
      }
      if (!room || !room.participants.has(id)) {
        return id;
      }
    }

    throw new Error("Unable to allocate a unique participant ID");
  }
}
