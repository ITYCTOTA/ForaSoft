/** @typedef {'participant-joined' | 'participant-left'} SystemEvent */

/**
 * @typedef {Object} Participant
 * @property {string} id Server-generated UUID; never a socket.id.
 * @property {string} displayName
 * @property {boolean} audioEnabled
 * @property {boolean} videoEnabled
 * @property {string} joinedAt UTC ISO-8601 timestamp
 */

/**
 * @typedef {{ type: 'participant', participantId: string, displayName: string }} ParticipantAuthor
 * @typedef {{ type: 'system' }} SystemAuthor
 * @typedef {{ type: 'user', id: string, author: ParticipantAuthor, text: string, createdAt: string }} UserMessage
 * @typedef {{ type: 'system', id: string, author: SystemAuthor, event: SystemEvent, participant: { id: string, displayName: string }, createdAt: string }} SystemMessage
 * @typedef {UserMessage | SystemMessage} Message
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {Map<string, Participant>} participants Key must equal Participant.id.
 * @property {Message[]} messages
 */

export const LIMITS = Object.freeze({
  MAX_PARTICIPANTS: 4,
  MAX_HISTORY_MESSAGES: 500,
  MAX_DISPLAY_NAME_CODE_POINTS: 30,
  MAX_MESSAGE_CODE_POINTS: 2_000,
  MAX_SOCKET_HTTP_BUFFER_BYTES: 256 * 1024,
  MAX_SDP_BYTES: 128 * 1024,
  MAX_ICE_CANDIDATE_BYTES: 8 * 1024,
})

export const SOCKET_EVENTS = Object.freeze({
  ROOM_JOIN: 'room:join',
  ROOM_PARTICIPANT_JOINED: 'room:participant-joined',
  ROOM_PARTICIPANT_LEFT: 'room:participant-left',
  ROOM_LEAVE: 'room:leave',
  ROOM_MEDIA_STATE: 'room:media-state',
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  MEDIA_STATE: 'media:state',
  SIGNAL_OFFER: 'signal:offer',
  SIGNAL_ANSWER: 'signal:answer',
  SIGNAL_ICE: 'signal:ice',
  SERVER_ERROR: 'server:error',
})

export const ERROR_CODES = Object.freeze({
  INVALID_ROOM_ID: 'INVALID_ROOM_ID',
  INVALID_DISPLAY_NAME: 'INVALID_DISPLAY_NAME',
  ROOM_FULL: 'ROOM_FULL',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_SIGNAL_TARGET: 'INVALID_SIGNAL_TARGET',
})

const participantKeys = ['id', 'displayName', 'audioEnabled', 'videoEnabled', 'joinedAt']
const userMessageKeys = ['id', 'type', 'author', 'text', 'createdAt']
const systemMessageKeys = ['id', 'type', 'author', 'event', 'participant', 'createdAt']

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value))
}

export function isParticipant(value) {
  return hasExactKeys(value, participantKeys)
    && isNonEmptyString(value.id)
    && typeof value.displayName === 'string'
    && typeof value.audioEnabled === 'boolean'
    && typeof value.videoEnabled === 'boolean'
    && isIsoTimestamp(value.joinedAt)
}

function isParticipantSnapshot(value) {
  return hasExactKeys(value, ['id', 'displayName'])
    && isNonEmptyString(value.id)
    && typeof value.displayName === 'string'
}

function isParticipantAuthor(value) {
  return hasExactKeys(value, ['type', 'participantId', 'displayName'])
    && value.type === 'participant'
    && isNonEmptyString(value.participantId)
    && typeof value.displayName === 'string'
}

export function isUserMessage(value) {
  return hasExactKeys(value, userMessageKeys)
    && value.type === 'user'
    && isNonEmptyString(value.id)
    && isParticipantAuthor(value.author)
    && typeof value.text === 'string'
    && isIsoTimestamp(value.createdAt)
}

export function isSystemMessage(value) {
  return hasExactKeys(value, systemMessageKeys)
    && value.type === 'system'
    && isNonEmptyString(value.id)
    && hasExactKeys(value.author, ['type'])
    && value.author.type === 'system'
    && (value.event === 'participant-joined' || value.event === 'participant-left')
    && isParticipantSnapshot(value.participant)
    && isIsoTimestamp(value.createdAt)
}

export function isMessage(value) {
  return isUserMessage(value) || isSystemMessage(value)
}

export function serializeParticipants(participants) {
  if (!(participants instanceof Map)) {
    return []
  }

  return [...participants.values()].filter(isParticipant).map((participant) => ({ ...participant }))
}

/**
 * Convert an internal Room to a Socket.io-safe snapshot. socket.id mappings
 * are intentionally not part of Participant or the serialized payload.
 * @param {Room} room
 */
export function serializeRoom(room) {
  return {
    id: room.id,
    participants: serializeParticipants(room.participants),
    messages: Array.isArray(room.messages) ? room.messages.filter(isMessage).map((message) => globalThis.structuredClone(message)) : [],
  }
}
