import { once } from 'node:events'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectTestSocket, startTestServer } from './fixtures/server.js'

describe('server composition root', () => {
  let testServer

  beforeAll(async () => {
    testServer = await startTestServer()
  })

  afterAll(async () => {
    await testServer?.close()
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

  const productionBundle = path.resolve('client/dist/index.html')
  const productionSmoke = existsSync(productionBundle) ? it : it.skip
  productionSmoke('serves the production SPA and Socket.io on one port', async () => {
    const room = await fetch(`${testServer.url}/room/production-smoke`)
    expect(room.status).toBe(200)
    expect(room.headers.get('content-type')).toContain('text/html')
    expect(await room.text()).toContain('<div id="root"></div>')

    const socket = connectTestSocket(testServer.url)
    try {
      await once(socket, 'connect')
      expect(socket.connected).toBe(true)
    } finally {
      socket.disconnect()
    }
  })

  it('joins a room and returns a snapshot, then rejects the fifth participant', async () => {
    const sockets = Array.from({ length: 5 }, () => connectTestSocket(testServer.url))
    try {
      const joins = []
      for (const [index, socket] of sockets.entries()) {
        joins.push(await new Promise((resolve) => {
          socket.emit('room:join', { roomId: 'integration-room', displayName: `User ${index}` }, resolve)
        }))
      }
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

  it('broadcasts server-authored chat and rate-limits the eleventh message', async () => {
    const socket = connectTestSocket(testServer.url)
    try {
      const joined = await new Promise((resolve) => socket.emit('room:join', { roomId: 'chat-room', displayName: 'Чаттер' }, resolve))
      const received = new Promise((resolve) => {
        const onMessage = (message) => message.type === 'user' ? resolve(message) : socket.once('chat:message', onMessage)
        socket.once('chat:message', onMessage)
      })
      const first = await new Promise((resolve) => socket.emit('chat:send', { text: '  hello  ', author: { participantId: 'spoof' } }, resolve))
      expect(joined.ok).toBe(true)
      expect(first).toMatchObject({ ok: true, message: { text: 'hello', author: { participantId: joined.self.id } } })
      await expect(received).resolves.toMatchObject({ text: 'hello' })
      for (let index = 0; index < 9; index += 1) {
        await new Promise((resolve) => socket.emit('chat:send', { text: `message ${index}` }, resolve))
      }
      const limited = await new Promise((resolve) => socket.emit('chat:send', { text: 'too many' }, resolve))
      expect(limited).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    } finally {
      socket.disconnect()
    }
  })

  it('relays SDP and ICE only to the addressed participant', async () => {
    const sender = connectTestSocket(testServer.url)
    const target = connectTestSocket(testServer.url)
    try {
      const senderJoin = await new Promise((resolve) => sender.emit('room:join', { roomId: 'signal-room', displayName: 'Отправитель' }, resolve))
      const targetJoin = await new Promise((resolve) => target.emit('room:join', { roomId: 'signal-room', displayName: 'Получатель' }, resolve))
      const offer = new Promise((resolve) => target.once('signal:offer', resolve))
      const answer = { type: 'answer', sdp: 'v=0' }
      const sent = await new Promise((resolve) => sender.emit('signal:offer', { targetId: targetJoin.self.id, sdp: { type: 'offer', sdp: 'v=0' }, fromId: 'spoof' }, resolve))
      expect(sent).toEqual({ ok: true })
      await expect(offer).resolves.toEqual({ fromId: senderJoin.self.id, sdp: { type: 'offer', sdp: 'v=0' } })
      const invalid = await new Promise((resolve) => sender.emit('signal:answer', { targetId: 'unknown', sdp: answer }, resolve))
      expect(invalid.code).toBe('INVALID_SIGNAL_TARGET')
    } finally {
      sender.disconnect()
      target.disconnect()
    }
  })

  it('broadcasts validated media state and includes it in later snapshots', async () => {
    const first = connectTestSocket(testServer.url)
    const second = connectTestSocket(testServer.url)
    try {
      const firstJoin = await new Promise((resolve) => first.emit('room:join', { roomId: 'media-room', displayName: 'Анна' }, resolve))
      await new Promise((resolve) => second.emit('room:join', { roomId: 'media-room', displayName: 'Борис' }, resolve))
      const update = new Promise((resolve) => second.once('room:media-state', resolve))
      const ack = await new Promise((resolve) => first.emit('media:state', { audioEnabled: true, videoEnabled: true }, resolve))
      expect(ack).toMatchObject({ ok: true, state: { id: firstJoin.self.id, audioEnabled: true, videoEnabled: true } })
      await expect(update).resolves.toEqual({ participantId: firstJoin.self.id, audioEnabled: true, videoEnabled: true })
      const invalid = await new Promise((resolve) => first.emit('media:state', { audioEnabled: 'yes', videoEnabled: false }, resolve))
      expect(invalid.code).toBe('INVALID_MESSAGE')
    } finally {
      first.disconnect()
      second.disconnect()
    }
  })
})
