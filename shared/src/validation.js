import { ERROR_CODES, LIMITS } from './contracts.js'

export const UI_MESSAGES = Object.freeze({
  MEDIA_ACCESS_DENIED: 'Нет доступа к камере или микрофону. Вы можете продолжить без них и изменить разрешение в настройках браузера.',
  WEBRTC_UNSUPPORTED: 'Ваш браузер не поддерживает видеозвонки WebRTC. Используйте актуальную версию Chrome, Firefox или Edge.',
  MEDIA_PEER_FAILED: 'Не удалось установить медиасоединение с этим участником.',
  SERVER_DISCONNECTED: 'Соединение с сервером потеряно. Войдите снова.',
  ROOM_FULL: 'Комната заполнена.',
})

const roomIdPattern = /^[A-Za-z0-9_-]{1,64}$/
const displayNamePattern = /^[\p{L}\p{N} _-]+$/u

/** Count Unicode code points rather than UTF-16 code units. */
export function codePointLength(value) {
  return typeof value === 'string' ? Array.from(value).length : 0
}

function success(value) {
  return { ok: true, value }
}

function failure(code, message) {
  return { ok: false, code, message }
}

export function validateRoomId(value) {
  if (typeof value !== 'string' || !roomIdPattern.test(value)) {
    return failure(ERROR_CODES.INVALID_ROOM_ID, 'Ссылка на комнату содержит недопустимый идентификатор.')
  }

  return success(value)
}

export function validateDisplayName(value) {
  if (typeof value !== 'string') {
    return failure(ERROR_CODES.INVALID_DISPLAY_NAME, 'Введите отображаемое имя.')
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return failure(ERROR_CODES.INVALID_DISPLAY_NAME, 'Введите отображаемое имя.')
  }

  if (codePointLength(normalized) > LIMITS.MAX_DISPLAY_NAME_CODE_POINTS) {
    return failure(ERROR_CODES.INVALID_DISPLAY_NAME, 'Имя не должно превышать 30 символов.')
  }

  if (!displayNamePattern.test(normalized)) {
    return failure(ERROR_CODES.INVALID_DISPLAY_NAME, 'Имя может содержать только буквы, цифры, пробел, дефис и подчёркивание.')
  }

  return success(normalized)
}

export function validateMessageText(value) {
  if (typeof value !== 'string') {
    return failure(ERROR_CODES.INVALID_MESSAGE, 'Сообщение должно быть текстом.')
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return failure(ERROR_CODES.INVALID_MESSAGE, 'Сообщение не может быть пустым.')
  }

  if (codePointLength(normalized) > LIMITS.MAX_MESSAGE_CODE_POINTS) {
    return failure(ERROR_CODES.INVALID_MESSAGE, 'Сообщение не должно превышать 2000 символов.')
  }

  // HTML/JS is intentionally retained as plain text; React escapes it at render time.
  return success(normalized)
}
