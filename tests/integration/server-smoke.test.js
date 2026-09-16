import { once } from 'node:events'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectTestSocket, startTestServer } from './fixtures/server.js'

describe('server composition root', () => {
  let testServer

  beforeAll(async () => {
    testServer = await startTestServer()
  })

  afterAll(async () => {
    await testServer.close()
  })

  it('serves health from a free port', async () => {
    const response = await fetch(`${testServer.url}/healthz`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('accepts and closes a Socket.io connection', async () => {
    const socket = connectTestSocket(testServer.url)

    await once(socket, 'connect')
    expect(socket.connected).toBe(true)

    const disconnected = once(socket, 'disconnect')
    socket.disconnect()
    await disconnected
    expect(socket.connected).toBe(false)
  })

  it('joins a room and returns a snapshot, then rejects the fifth participant', async () => {
    const sockets = Array.from({ length: 5 }, () => connectTestSocket(testServer.url))
    try {
      const joins = await Promise.all(sockets.map((socket, index) => new Promise((resolve) => {
        socket.emit('room:join', { roomId: 'integration-room', displayName: `User ${index}` }, resolve)
      })))
      expect(joins.slice(0, 4).every((result) => result.ok)).toBe(true)
      expect(joins[0].participants).toHaveLength(1)
      expect(joins[4]).toMatchObject({ ok: false, code: 'ROOM_FULL', message: 'Комната заполнена.' })
      expect(new Set(joins.slice(0, 4).map((result) => result.self.id)).size).toBe(4)
    } finally {
      sockets.forEach((socket) => socket.disconnect())
    }
  })

  it('handles explicit leave idempotently and frees the room', async () => {
    const first = connectTestSocket(testServer.url)
    const second = connectTestSocket(testServer.url)
    try {
      const firstJoin = await new Promise((resolve) => first.emit('room:join', { roomId: 'leave-room', displayName: 'Анна' }, resolve))
      const secondJoin = await new Promise((resolve) => second.emit('room:join', { roomId: 'leave-room', displayName: 'Борис' }, resolve))
      const leftEvent = new Promise((resolve) => second.once('room:participant-left', resolve))
      const chatEvent = new Promise((resolve) => {
        const onMessage = (message) => message.event === 'participant-left' ? resolve(message) : second.once('chat:message', onMessage)
        second.once('chat:message', onMessage)
      })
      const leaveAck = await new Promise((resolve) => first.emit('room:leave', {}, resolve))
      expect(firstJoin.ok).toBe(true)
      expect(secondJoin.ok).toBe(true)
      expect(leaveAck).toEqual({ ok: true })
      await expect(leftEvent).resolves.toMatchObject({ participant: { displayName: 'Анна' } })
      await expect(chatEvent).resolves.toMatchObject({ event: 'participant-left' })
      first.disconnect()
      expect(second.connected).toBe(true)
    } finally {
      first.disconnect()
      second.disconnect()
    }
  })
})
