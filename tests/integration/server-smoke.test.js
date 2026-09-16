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
})
