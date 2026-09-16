import { ERROR_CODES, SOCKET_EVENTS, UI_MESSAGES, serializeRoom, validateDisplayName, validateMessageText, validateRoomId } from '@video-chat-room/shared'

export class RoomGateway {
  constructor({ io, registry, clock = () => Date.now() }) {
    this.io = io
    this.registry = registry
    this.bindings = new Map()
    this.participantSockets = new Map()
    this.clock = clock
    this.rateWindows = new Map()
  }

  register() {
    this.io.on('connection', (socket) => {
      socket.on(SOCKET_EVENTS.ROOM_JOIN, (payload, acknowledge) => {
        this.join(socket, payload, acknowledge)
      })
      socket.on(SOCKET_EVENTS.ROOM_LEAVE, (_payload, acknowledge) => {
        const result = this.leave(socket)
        acknowledge?.({ ok: result.ok })
      })
      socket.on('disconnect', () => this.leave(socket))
      socket.on(SOCKET_EVENTS.CHAT_SEND, (payload, acknowledge) => {
        this.sendChat(socket, payload, acknowledge)
      })
    })
    return this
  }

  join(socket, payload, acknowledge = () => {}) {
    const roomIdResult = validateRoomId(payload?.roomId)
    if (!roomIdResult.ok) return acknowledge({ ok: false, code: roomIdResult.code, message: roomIdResult.message })
    const nameResult = validateDisplayName(payload?.displayName)
    if (!nameResult.ok) return acknowledge({ ok: false, code: nameResult.code, message: nameResult.message })
    if (this.bindings.has(socket.id)) {
      return acknowledge({ ok: false, code: ERROR_CODES.NOT_IN_ROOM, message: 'Вы уже вошли в комнату.' })
    }

    const result = this.registry.join({ roomId: roomIdResult.value, displayName: nameResult.value })
    if (!result.ok) {
      const message = result.code === ERROR_CODES.ROOM_FULL ? UI_MESSAGES.ROOM_FULL : 'Не удалось войти в комнату.'
      return acknowledge({ ok: false, code: result.code, message })
    }

    const roomId = roomIdResult.value
    const initialSnapshot = serializeRoom(result.room)
    socket.join(roomId)
    this.bindings.set(socket.id, { roomId, participantId: result.participant.id })
    this.participantSockets.set(result.participant.id, socket.id)
    acknowledge({ ok: true, self: result.participant, participants: initialSnapshot.participants, messages: initialSnapshot.messages })

    const systemMessage = this.registry.createSystemMessage({ event: 'participant-joined', participant: result.participant })
    this.registry.appendMessage(roomId, systemMessage)
    socket.to(roomId).emit(SOCKET_EVENTS.ROOM_PARTICIPANT_JOINED, { participant: result.participant })
    this.io.to(roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, systemMessage)
  }

  leave(socket) {
    const binding = this.bindings.get(socket.id)
    if (!binding) return { ok: false }
    this.rateWindows.delete(socket.id)
    this.bindings.delete(socket.id)
    this.participantSockets.delete(binding.participantId)
    const result = this.registry.leave(binding.roomId, binding.participantId)
    socket.leave(binding.roomId)
    if (!result.ok) return result
    if (result.room) {
      this.io.to(binding.roomId).emit(SOCKET_EVENTS.ROOM_PARTICIPANT_LEFT, { participant: result.participant })
      this.io.to(binding.roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, result.message)
    }
    return result
  }

  sendChat(socket, payload, acknowledge = () => {}) {
    const binding = this.bindings.get(socket.id)
    if (!binding) return acknowledge({ ok: false, code: ERROR_CODES.NOT_IN_ROOM, message: 'Вы не вошли в комнату.' })
    const textResult = validateMessageText(payload?.text)
    if (!textResult.ok) return acknowledge({ ok: false, code: textResult.code, message: textResult.message })
    const now = this.clock()
    const windowStart = now - 10_000
    const timestamps = (this.rateWindows.get(socket.id) ?? []).filter((value) => value > windowStart)
    if (timestamps.length >= 10) {
      this.rateWindows.set(socket.id, timestamps)
      return acknowledge({ ok: false, code: ERROR_CODES.RATE_LIMITED, message: 'Слишком много сообщений. Попробуйте позже.' })
    }
    timestamps.push(now)
    this.rateWindows.set(socket.id, timestamps)
    const participant = this.registry.get(binding.roomId)?.participants.get(binding.participantId)
    if (!participant) return acknowledge({ ok: false, code: ERROR_CODES.NOT_IN_ROOM, message: 'Вы не вошли в комнату.' })
    const message = this.registry.createUserMessage({ participant, text: textResult.value })
    this.registry.appendMessage(binding.roomId, message)
    this.io.to(binding.roomId).emit(SOCKET_EVENTS.CHAT_MESSAGE, message)
    acknowledge({ ok: true, message })
  }
}
