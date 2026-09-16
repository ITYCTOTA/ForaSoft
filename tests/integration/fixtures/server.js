import { once } from 'node:events'
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { io } from 'socket.io-client'

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export async function getFreePort() {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const { port } = probe.address()
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
  return port
}

async function waitForServer(url, processHandle) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Test server exited with code ${processHandle.exitCode}`)
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
  const server = spawn(process.execPath, ['server/src/index.js'], {
    cwd: rootDirectory,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  })
  const url = `http://127.0.0.1:${port}`

  await waitForServer(url, server)

  return {
    server,
    url,
    async close() {
      if (server.exitCode === null) {
        server.kill()
        await once(server, 'exit')
      }
    },
  }
}

export function connectTestSocket(url) {
  return io(url, {
    autoConnect: true,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  })
}
