import { once } from 'node:events'
import net from 'node:net'

import { io } from 'socket.io-client'

import { createHttpServer } from '../../../server/src/app.js'

export async function getFreePort() {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = probe.address()
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
  return port
}

async function waitForServer(url, httpServer) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    if (!httpServer.listening) {
      throw new Error('Test server stopped before becoming healthy')
    }

    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // The process is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Timed out waiting for test server')
}

export async function startTestServer() {
  const port = await getFreePort()
  const application = createHttpServer({
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
  })
  application.httpServer.listen(port, '127.0.0.1')
  await once(application.httpServer, 'listening')
  const url = `http://127.0.0.1:${port}`

  await waitForServer(`${url}/healthz`, application.httpServer)

  return {
    server: application.httpServer,
    url,
    async close() {
      await application.shutdown()
      if (application.httpServer.listening)
        await new Promise((resolve, reject) =>
          application.httpServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        )
    },
  }
}

export function connectTestSocket(url) {
  return io(url, {
    autoConnect: true,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    extraHeaders: { Origin: 'http://localhost:5173' },
  })
}
