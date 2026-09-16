import { describe, expect, it } from 'vitest'

import { ERROR_CODES, LIMITS } from './contracts.js'
import {
  UI_MESSAGES,
  codePointLength,
  validateDisplayName,
  validateMessageText,
  validateRoomId,
} from './validation.js'

describe('shared validation', () => {
  it('counts Unicode code points, including astral characters', () => {
    expect(codePointLength('😀')).toBe(1)
    expect(codePointLength('а😀')).toBe(2)
  })

  it('normalizes valid names and rejects blank, long and special input', () => {
    expect(validateDisplayName('  Анна-2_тест  ')).toEqual({ ok: true, value: 'Анна-2_тест' })
    expect(validateDisplayName('   ').code).toBe(ERROR_CODES.INVALID_DISPLAY_NAME)
    expect(validateDisplayName('а'.repeat(LIMITS.MAX_DISPLAY_NAME_CODE_POINTS)).ok).toBe(true)
    expect(validateDisplayName('а'.repeat(LIMITS.MAX_DISPLAY_NAME_CODE_POINTS + 1)).ok).toBe(false)
    expect(validateDisplayName('Имя<script>').ok).toBe(false)
    expect(validateDisplayName('Имя😀').ok).toBe(false)
  })

  it('validates room identifiers without changing them', () => {
    expect(validateRoomId('room_ABC-123')).toEqual({ ok: true, value: 'room_ABC-123' })
    expect(validateRoomId('a'.repeat(64)).ok).toBe(true)
    expect(validateRoomId('a'.repeat(65)).ok).toBe(false)
    expect(validateRoomId('room/with/slash').code).toBe(ERROR_CODES.INVALID_ROOM_ID)
    expect(validateRoomId('')).toEqual(expect.objectContaining({ ok: false, code: ERROR_CODES.INVALID_ROOM_ID }))
  })

  it('trims messages, preserves markup as plain text and enforces code-point limit', () => {
    expect(validateMessageText('  <b>Привет</b>  ')).toEqual({ ok: true, value: '<b>Привет</b>' })
    expect(validateMessageText(' \n\t ').code).toBe(ERROR_CODES.INVALID_MESSAGE)
    expect(validateMessageText('😀'.repeat(LIMITS.MAX_MESSAGE_CODE_POINTS)).ok).toBe(true)
    expect(validateMessageText('😀'.repeat(LIMITS.MAX_MESSAGE_CODE_POINTS + 1)).ok).toBe(false)
  })

  it('exposes the five approved Russian UI messages verbatim', () => {
    expect(Object.values(UI_MESSAGES)).toEqual([
      'Нет доступа к камере или микрофону. Вы можете продолжить без них и изменить разрешение в настройках браузера.',
      'Ваш браузер не поддерживает видеозвонки WebRTC. Используйте актуальную версию Chrome, Firefox или Edge.',
      'Не удалось установить медиасоединение с этим участником.',
      'Соединение с сервером потеряно. Войдите снова.',
      'Комната заполнена.',
    ])
  })
})
