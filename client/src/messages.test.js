import { describe, expect, it } from 'vitest'
import { formatMessageTime, initialMessagesState, messagesList, messagesReducer } from './features/room/model/messages.js'
describe('messagesReducer', () => {
  it('deduplicates and limits history', () => {
    const same = messagesReducer(initialMessagesState, { type: 'add', message: { id: 'x', text: 'old' } })
    expect(messagesList(messagesReducer(same, { type: 'add', message: { id: 'x', text: 'new' } }))[0].text).toBe('old')
    let state = initialMessagesState
    for (let i = 0; i < 501; i += 1) state = messagesReducer(state, { type: 'add', message: { id: String(i) } })
    expect(state.order).toHaveLength(500)
    expect(state.order[0]).toBe('1')
  })
  it('formats HH:mm', () => expect(formatMessageTime('2026-01-02T03:04:05Z')).toMatch(/^\d{2}:\d{2}$/))
})
