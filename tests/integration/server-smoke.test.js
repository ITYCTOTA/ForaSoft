import { once } from 'node:events'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { connectTestSocket, startTestServer } from './fixtures/server.js'

describe('server scaffold', () => {
  let testServer

  beforeAll(async () => {
    testServer = await startTestServer()
  })

  afterAll(async () => {
    await testServer.close()
  })

  it('serves the server scaffold from a free port', async () => {
    const response = await fetch(testServer.url)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain('Video Chat Room server scaffold')
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
})
