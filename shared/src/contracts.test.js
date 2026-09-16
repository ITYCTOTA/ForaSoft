import { describe, expect, it } from 'vitest'

import {
  ERROR_CODES,
  LIMITS,
  SOCKET_EVENTS,
  isMessage,
  isParticipant,
  isSystemMessage,
  isUserMessage,
  serializeRoom,
} from './contracts.js'

const participant = {
  id: 'participant-uuid-1',
  displayName: 'Алекс',
  audioEnabled: true,
  videoEnabled: true,
  joinedAt: '2026-09-16T10:00:00.000Z',
}

const userMessage = {
  id: 'message-uuid-1',
  type: 'user',
  author: { type: 'participant', participantId: participant.id, displayName: participant.displayName },
  text: 'Привет!',
  createdAt: '2026-09-16T10:00:05.000Z',
}

const systemMessage = {
  id: 'message-uuid-2',
  type: 'system',
  author: { type: 'system' },
  event: 'participant-joined',
  participant: { id: participant.id, displayName: participant.displayName },
  createdAt: '2026-09-16T10:00:00.000Z',
}

describe('shared contracts', () => {
  it('publishes stable protocol constants', () => {
    expect(LIMITS.MAX_PARTICIPANTS).toBe(4)
    expect(LIMITS.MAX_HISTORY_MESSAGES).toBe(500)
    expect(SOCKET_EVENTS.ROOM_JOIN).toBe('room:join')
    expect(SOCKET_EVENTS.SIGNAL_ICE).toBe('signal:ice')
    expect(ERROR_CODES.ROOM_FULL).toBe('ROOM_FULL')
  })

  it('accepts a participant without transport identity', () => {
    expect(isParticipant(participant)).toBe(true)
    expect(isParticipant({ ...participant, socketId: 'socket-1' })).toBe(false)
  })

  it('accepts a user message with a participant author', () => {
    expect(isUserMessage(userMessage)).toBe(true)
    expect(isMessage(userMessage)).toBe(true)
  })

  it('accepts a system message with a typed system author', () => {
    expect(isSystemMessage(systemMessage)).toBe(true)
    expect(isMessage(systemMessage)).toBe(true)
  })

  it('rejects null authors and mixed user/system shapes', () => {
    expect(isMessage({ ...userMessage, author: null })).toBe(false)
    expect(isMessage({ ...systemMessage, text: 'should not be here' })).toBe(false)
    expect(isMessage({ ...userMessage, event: 'participant-joined' })).toBe(false)
  })

  it('serializes a Map as participants and keeps system outside the slot count', () => {
    const room = {
      id: 'room-uuid-1',
      participants: new Map([[participant.id, participant]]),
      messages: [userMessage, systemMessage],
    }
    const serialized = serializeRoom(room)

    expect(serialized.participants).toHaveLength(1)
    expect(serialized.participants[0]).toEqual(participant)
    expect(serialized.participants[0]).not.toHaveProperty('socketId')
    expect(serialized.messages).toEqual([userMessage, systemMessage])
    expect(serialized.messages).not.toBe(room.messages)
  })

  it('does not expose a mutable internal participant or message object', () => {
    const room = {
      id: 'room-uuid-1',
      participants: new Map([[participant.id, participant]]),
      messages: [userMessage, systemMessage],
    }
    const serialized = serializeRoom(room)

    serialized.participants[0].displayName = 'Изменено'
    serialized.messages[0].author.displayName = 'Изменено'
    expect(participant.displayName).toBe('Алекс')
    expect(userMessage.author.displayName).toBe('Алекс')
  })
})
