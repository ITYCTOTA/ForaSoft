import { UI_MESSAGES } from '@video-chat-room/shared'

const MEDIA_UNAVAILABLE_MESSAGE = 'Камера или микрофон недоступны. Проверьте устройства в настройках браузера или ОС.'

function createEmptyStream(MediaStreamCtor) {
  if (MediaStreamCtor) return new MediaStreamCtor()
  const tracks = []
  return { addTrack: (track) => tracks.push(track), getTracks: () => tracks.slice(), getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'), getVideoTracks: () => tracks.filter((track) => track.kind === 'video') }
}

export class MediaController {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, secureContext = globalThis.isSecureContext !== false, MediaStreamCtor = globalThis.MediaStream } = {}) {
    this.mediaDevices = mediaDevices
    this.secureContext = secureContext
    this.MediaStreamCtor = MediaStreamCtor
    this.stream = createEmptyStream(MediaStreamCtor)
    this.requestId = 0
  }

  async acquire() {
    const requestId = ++this.requestId
    if (!this.secureContext || !this.mediaDevices?.getUserMedia) return this.#result(UI_MESSAGES.WEBRTC_UNSUPPORTED)
    const [audio, video] = await Promise.allSettled([
      this.mediaDevices.getUserMedia({ audio: true, video: false }),
      this.mediaDevices.getUserMedia({ audio: false, video: true }),
    ])
    if (requestId !== this.requestId) {
      for (const result of [audio, video]) if (result.status === 'fulfilled') stopTracks(result.value)
      return this.#result()
    }
    this.stream = createEmptyStream(this.MediaStreamCtor)
    for (const result of [audio, video]) if (result.status === 'fulfilled') result.value.getTracks().forEach((track) => this.stream.addTrack(track))
    const error = messageFor([audio, video])
    return this.#result(error)
  }

  stop() {
    this.requestId += 1
    stopTracks(this.stream)
    this.stream = createEmptyStream(this.MediaStreamCtor)
    return this.#result()
  }

  toggleAudio() {
    const track = this.stream.getAudioTracks()[0]
    if (!track) return this.#result()
    track.enabled = !track.enabled
    return this.#result()
  }

  #result(error = null) {
    return { stream: this.stream, audioEnabled: this.stream.getAudioTracks().some((track) => track.enabled), videoEnabled: this.stream.getVideoTracks().some((track) => track.enabled), error }
  }
}

function stopTracks(stream) { stream?.getTracks?.().forEach((track) => track.stop()) }
function messageFor(results) {
  const reasons = results.filter((result) => result.status === 'rejected').map((result) => result.reason?.name)
  if (reasons.includes('NotAllowedError')) return UI_MESSAGES.MEDIA_ACCESS_DENIED
  if (reasons.length > 0) return MEDIA_UNAVAILABLE_MESSAGE
  return null
}
