import { describe, expect, it } from 'vitest'

import { RoomSession } from './features/room/model/roomSession.js'

function fakeSocket() {
  const handlers = new Map()
  return {
    connected: false,
    on(event, handler) { handlers.set(event, handler) },
    once(event, handler) { handlers.set(`once:${event}`, handler) },
    emit(event, payload, ack) { this.last = { event, payload, ack } },
    connect() { this.connected = true; handlers.get('once:connect')?.() },
    disconnect() { this.connected = false; handlers.get('disconnect')?.() },
    trigger(event, value) { handlers.get(`once:${event}`)?.(value) },
  }
}

describe('RoomSession', () => {
  it('creates a manual socket and joins only after connect', async () => {
    const socket = fakeSocket()
    const states = []
    const session = new RoomSession({ socketFactory: () => socket, onState: (state) => states.push(state) })
    const joining = session.join({ roomId: 'room', displayName: 'Анна' })
    expect(socket.last.event).toBe('room:join')
    socket.last.ack({ ok: true, self: { id: 'p' }, participants: [], messages: [] })
    await expect(joining).resolves.toMatchObject({ ok: true })
    expect(states.at(-1).status).toBe('joined')
  })

  it('preserves join error instead of replacing it with disconnect', async () => {
    const socket = fakeSocket()
    const states = []
    const session = new RoomSession({ socketFactory: () => socket, onState: (state) => states.push(state) })
    const joining = session.join({ roomId: 'room', displayName: 'Анна' })
    socket.last.ack({ ok: false, code: 'ROOM_FULL', message: 'Комната заполнена.' })
    await expect(joining).resolves.toMatchObject({ code: 'ROOM_FULL' })
    expect(states.at(-1)).toMatchObject({ status: 'error', code: 'ROOM_FULL' })
  })

  it('sends only explicit media state payload', async () => {
    const socket = fakeSocket(); const session = new RoomSession({ socketFactory: () => socket })
    const sent = session.sendMediaState({ audioEnabled: false, videoEnabled: true })
    expect(socket.last).toMatchObject({ event: 'media:state', payload: { audioEnabled: false, videoEnabled: true } })
    socket.last.ack({ ok: true }); await expect(sent).resolves.toEqual({ ok: true })
  })
})
