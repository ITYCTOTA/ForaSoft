import { randomUUID } from 'node:crypto'

import { LIMITS, serializeRoom } from '@video-chat-room/shared'

function timestamp(clock) {
  const value = clock()
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('clock must return a valid Date')
  }
  return value.toISOString()
}

function participantSnapshot(participant) {
  return { id: participant.id, displayName: participant.displayName }
}

export function createUserMessage({ participant, text, idFactory = randomUUID, clock = () => new Date() }) {
  return {
    id: idFactory(),
    type: 'user',
    author: { type: 'participant', participantId: participant.id, displayName: participant.displayName },
    text,
    createdAt: timestamp(clock),
  }
}

export function createSystemMessage({ event, participant, idFactory = randomUUID, clock = () => new Date() }) {
  if (event !== 'participant-joined' && event !== 'participant-left') {
    throw new TypeError('event must be participant-joined or participant-left')
  }
  return {
    id: idFactory(),
    type: 'system',
    author: { type: 'system' },
    event,
    participant: participantSnapshot(participant),
    createdAt: timestamp(clock),
  }
}

export function appendMessage(room, message, maxMessages = LIMITS.MAX_HISTORY_MESSAGES) {
  room.messages.push(message)
  if (room.messages.length > maxMessages) {
    room.messages.splice(0, room.messages.length - maxMessages)
  }
  return message
}

export function snapshotRoom(room) {
  return serializeRoom(room)
}
