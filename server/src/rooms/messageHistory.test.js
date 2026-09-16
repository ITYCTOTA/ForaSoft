import { describe, expect, it } from 'vitest'

import { LIMITS, isSystemMessage, isUserMessage } from '@video-chat-room/shared'

import { appendMessage, createSystemMessage, createUserMessage, snapshotRoom } from './messageHistory.js'

const participant = { id: 'p-1', displayName: 'Анна' }
const idFactory = (() => {
  let n = 0
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
})()
const clock = () => new Date('2026-01-02T03:04:05.000Z')

describe('message history', () => {
  it('creates user messages with server metadata and author snapshot', () => {
    const message = createUserMessage({ participant, text: '<b>hello</b>', idFactory, clock })
    expect(isUserMessage(message)).toBe(true)
    expect(message.author).toEqual({ type: 'participant', participantId: 'p-1', displayName: 'Анна' })
  })

  it('creates typed system messages with participant snapshot', () => {
    const message = createSystemMessage({ event: 'participant-left', participant, idFactory, clock })
    expect(isSystemMessage(message)).toBe(true)
    expect(message.participant).toEqual(participant)
  })

  it('keeps only the newest 500 messages', () => {
    const room = { id: 'room', participants: new Map(), messages: [] }
    for (let index = 0; index < LIMITS.MAX_HISTORY_MESSAGES + 1; index += 1) {
      appendMessage(room, { id: String(index), type: 'user' })
    }
    expect(room.messages).toHaveLength(500)
    expect(room.messages[0].id).toBe('1')
  })

  it('returns a deep snapshot independent from the room', () => {
    const stored = { ...participant, audioEnabled: false, videoEnabled: false, joinedAt: clock().toISOString() }
    const room = { id: 'room', participants: new Map([[stored.id, stored]]), messages: [createUserMessage({ participant, text: 'hi', idFactory, clock })] }
    const snapshot = snapshotRoom(room)
    snapshot.participants[0].displayName = 'Изменено'
    snapshot.messages[0].text = 'Изменено'
    expect(stored.displayName).toBe('Анна')
    expect(room.messages[0].text).toBe('hi')
  })
})
