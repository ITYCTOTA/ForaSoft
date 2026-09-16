import { describe, expect, it } from 'vitest'
import { UI_MESSAGES } from '@video-chat-room/shared'
import { MediaController } from './mediaController.js'

function track(kind) { return { kind, enabled: true, stop() { this.stopped = true } } }
function stream(...tracks) { return { getTracks: () => tracks, getAudioTracks: () => tracks.filter((item) => item.kind === 'audio'), getVideoTracks: () => tracks.filter((item) => item.kind === 'video') } }
const mediaStream = class { constructor() { this.tracks = [] } addTrack(item) { this.tracks.push(item) } removeTrack(item) { this.tracks = this.tracks.filter((track) => track !== item) } getTracks() { return this.tracks } getAudioTracks() { return this.tracks.filter((item) => item.kind === 'audio') } getVideoTracks() { return this.tracks.filter((item) => item.kind === 'video') } }
function rejected(name) { return Promise.reject({ name }) }

describe('MediaController', () => {
  it('keeps available audio when camera is missing', async () => {
    const audio = track('audio'); const controller = new MediaController({ MediaStreamCtor: mediaStream, mediaDevices: { getUserMedia: ({ audio: wantsAudio }) => wantsAudio ? Promise.resolve(stream(audio)) : rejected('NotFoundError') } })
    await expect(controller.acquire()).resolves.toMatchObject({ audioEnabled: true, videoEnabled: false, error: 'Камера или микрофон недоступны. Проверьте устройства в настройках браузера или ОС.' })
  })
  it('keeps available camera when audio permission is denied', async () => {
    const video = track('video'); const controller = new MediaController({ MediaStreamCtor: mediaStream, mediaDevices: { getUserMedia: ({ video: wantsVideo }) => wantsVideo ? Promise.resolve(stream(video)) : rejected('NotAllowedError') } })
    await expect(controller.acquire()).resolves.toMatchObject({ audioEnabled: false, videoEnabled: true, error: UI_MESSAGES.MEDIA_ACCESS_DENIED })
  })
  it('returns empty stream without devices and stops tracks on cleanup', async () => {
    const controller = new MediaController({ MediaStreamCtor: mediaStream, mediaDevices: { getUserMedia: () => rejected('NotReadableError') } })
    await expect(controller.acquire()).resolves.toMatchObject({ audioEnabled: false, videoEnabled: false, error: 'Камера или микрофон недоступны. Проверьте устройства в настройках браузера или ОС.' })
    const audio = track('audio'); controller.stream.addTrack(audio); controller.stop(); expect(audio.stopped).toBe(true)
  })
  it('does not retain late tracks after cancellation', async () => {
    let resolveAudio; const late = new Promise((resolve) => { resolveAudio = resolve }); const controller = new MediaController({ MediaStreamCtor: mediaStream, mediaDevices: { getUserMedia: ({ audio: wantsAudio }) => wantsAudio ? late : Promise.resolve(stream()) } })
    const pending = controller.acquire(); controller.stop(); const audio = track('audio'); resolveAudio(stream(audio)); await pending
    expect(audio.stopped).toBe(true)
  })
  it('toggles an available microphone without recreating media', async () => {
    const audio = track('audio'); const controller = new MediaController({ MediaStreamCtor: mediaStream, mediaDevices: { getUserMedia: ({ audio: wantsAudio }) => Promise.resolve(wantsAudio ? stream(audio) : stream()) } })
    await controller.acquire()
    expect(controller.toggleAudio()).toMatchObject({ audioEnabled: false })
    expect(controller.toggleAudio()).toMatchObject({ audioEnabled: true })
  })
  it('stops camera and can acquire a new video track', async () => {
    const first = track('video'); const second = track('video'); let calls = 0; const controller = new MediaController({ MediaStreamCtor: mediaStream, mediaDevices: { getUserMedia: ({ video }) => Promise.resolve(video ? stream(calls++ === 0 ? first : second) : stream()) } })
    await controller.acquire(); expect(controller.disableVideo()).toMatchObject({ videoEnabled: false }); expect(first.stopped).toBe(true)
    await expect(controller.enableVideo()).resolves.toMatchObject({ videoEnabled: true }); expect(controller.stream.getVideoTracks()[0]).toBe(second)
  })
})
