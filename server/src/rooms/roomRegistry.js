import { randomUUID } from 'node:crypto'

import { ERROR_CODES, LIMITS } from '@video-chat-room/shared'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * In-memory room registry. The join operation is synchronous so the capacity
 * check and participant insertion cannot be interleaved by another handler.
 */
export class RoomRegistry {
  /**
   * @param {{ maxParticipants?: number, idFactory?: () => string, clock?: () => Date }} [options]
   */
  constructor({ maxParticipants = LIMITS.MAX_PARTICIPANTS, idFactory = randomUUID, clock = () => new Date() } = {}) {
    this.maxParticipants = maxParticipants
    this.idFactory = idFactory
    this.clock = clock
    /** @type {Map<string, object>} */
    this.rooms = new Map()
  }

  /**
   * Atomically add a participant. A missing room is only inserted after the
   * participant has passed every check and has been created successfully.
   * @param {{ roomId: string, displayName: string }} input
   * @returns {{ ok: true, room: object, participant: import('@video-chat-room/shared').Participant } | { ok: false, code: string, room: null, participant: null }}
   */
  join({ roomId, displayName }) {
    const currentRoom = this.rooms.get(roomId)
    if (currentRoom && currentRoom.participants.size >= this.maxParticipants) {
      return { ok: false, code: ERROR_CODES.ROOM_FULL, room: null, participant: null }
    }

    const participant = {
      id: this.#createUniqueParticipantId(currentRoom),
      displayName,
      audioEnabled: false,
      videoEnabled: false,
      joinedAt: this.clock().toISOString(),
    }
    const room = currentRoom ?? {
      id: roomId,
      participants: new Map(),
      messages: [],
    }

    room.participants.set(participant.id, participant)
    if (!currentRoom) {
      this.rooms.set(roomId, room)
    }

    return { ok: true, room, participant }
  }

  /** @param {string} roomId */
  get(roomId) {
    return this.rooms.get(roomId)
  }

  /** @param {string} roomId */
  has(roomId) {
    return this.rooms.has(roomId)
  }

  get roomCount() {
    return this.rooms.size
  }

  #createUniqueParticipantId(room) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const id = this.idFactory()
      if (!UUID_V4_PATTERN.test(id)) {
        throw new TypeError('idFactory must return a UUID v4')
      }
      if (!room || !room.participants.has(id)) {
        return id
      }
    }

    throw new Error('Unable to allocate a unique participant ID')
  }
}
