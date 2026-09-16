import { createServer } from 'node:http'

import express from 'express'
import { Server } from 'socket.io'

const port = Number(process.env.PORT ?? 3000)
const app = express()
const httpServer = createServer(app)

new Server(httpServer)

app.get('/', (_request, response) => {
  response.type('text').send('Video Chat Room server scaffold')
})

httpServer.listen(port, '0.0.0.0', () => {
  console.info(`Video Chat Room server listening on port ${port}`)
})
