import { describe, expect, it } from 'vitest'

import { ERROR_CODES, LIMITS } from '@video-chat-room/shared'

import { RoomRegistry } from './roomRegistry.js'

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]

function makeRegistry() {
  let idIndex = 0
  return new RoomRegistry({
    idFactory: () => ids[idIndex++],
    clock: () => new Date('2026-09-16T10:00:00.000Z'),
  })
}

describe('RoomRegistry', () => {
  it('creates a missing room only after a successful first join', () => {
    const registry = makeRegistry()

    expect(registry.has('new-room')).toBe(false)
    const result = registry.join({ roomId: 'new-room', displayName: 'Алекс' })

    expect(result.ok).toBe(true)
    expect(registry.roomCount).toBe(1)
    expect(registry.get('new-room')).toBe(result.room)
    expect(result.participant).toMatchObject({
      id: ids[0],
      displayName: 'Алекс',
      audioEnabled: false,
      videoEnabled: false,
      joinedAt: '2026-09-16T10:00:00.000Z',
    })
  })

  it('keeps duplicate display names as separate participants', () => {
    const registry = makeRegistry()

    const first = registry.join({ roomId: 'room', displayName: 'Алекс' })
    const second = registry.join({ roomId: 'room', displayName: 'Алекс' })

    expect(first.ok && second.ok).toBe(true)
    expect(first.participant.id).not.toBe(second.participant.id)
    expect(registry.get('room').participants.size).toBe(2)
    expect([...registry.get('room').participants.values()].map(({ displayName }) => displayName)).toEqual(['Алекс', 'Алекс'])
  })

  it('enforces four participants and rejects the fifth without changing state', () => {
    const registry = makeRegistry()
    for (let index = 0; index < LIMITS.MAX_PARTICIPANTS; index += 1) {
      expect(registry.join({ roomId: 'room', displayName: `Участник ${index + 1}` }).ok).toBe(true)
    }

    const rejected = registry.join({ roomId: 'room', displayName: 'Пятый' })

    expect(rejected).toEqual({ ok: false, code: ERROR_CODES.ROOM_FULL, room: null, participant: null })
    expect(registry.get('room').participants.size).toBe(LIMITS.MAX_PARTICIPANTS)
    expect(registry.roomCount).toBe(1)
  })

  it('resolves a simultaneous last-slot race in call order', () => {
    const registry = makeRegistry()
    for (let index = 0; index < 3; index += 1) {
      registry.join({ roomId: 'room', displayName: `Участник ${index + 1}` })
    }

    const first = registry.join({ roomId: 'room', displayName: 'Гонка 1' })
    const second = registry.join({ roomId: 'room', displayName: 'Гонка 2' })

    expect(first.ok).toBe(true)
    expect(second).toMatchObject({ ok: false, code: ERROR_CODES.ROOM_FULL })
    expect(registry.get('room').participants.size).toBe(4)
  })

  it('does not grant the first participant special fields or rights', () => {
    const registry = makeRegistry()
    const result = registry.join({ roomId: 'room', displayName: 'Создатель' })

    expect(result.participant).toEqual({
      id: ids[0],
      displayName: 'Создатель',
      audioEnabled: false,
      videoEnabled: false,
      joinedAt: '2026-09-16T10:00:00.000Z',
    })
    expect(Object.keys(result.participant)).not.toContain('isCreator')
    expect(Object.keys(result.participant)).not.toContain('socketId')
  })

  it('rejects an invalid generated identity instead of creating an unsafe participant', () => {
    const registry = new RoomRegistry({ idFactory: () => 'socket-id' })

    expect(() => registry.join({ roomId: 'room', displayName: 'Алекс' })).toThrow('UUID v4')
    expect(registry.has('room')).toBe(false)
  })

  it('removes a participant, records a leave event and deletes empty rooms', () => {
    const registry = makeRegistry()
    const joined = registry.join({ roomId: 'room', displayName: 'Анна' })
    const left = registry.leave('room', joined.participant.id)

    expect(left.ok).toBe(true)
    expect(left.message.event).toBe('participant-left')
    expect(left.participant).toEqual({ id: joined.participant.id, displayName: 'Анна' })
    expect(registry.has('room')).toBe(false)
    expect(registry.leave('room', joined.participant.id).ok).toBe(false)
  })
})
