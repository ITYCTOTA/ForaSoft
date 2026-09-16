import { describe, expect, it } from 'vitest'

import { initialParticipantsState, participantsList, participantsReducer } from './participants.js'

const anna = { id: 'p-1', displayName: 'Анна', audioEnabled: false, videoEnabled: false }

describe('participantsReducer', () => {
  it('loads snapshot and keeps duplicate display names by UUID', () => {
    const state = participantsReducer(initialParticipantsState, { type: 'snapshot', selfId: 'p-1', participants: [anna, { ...anna, id: 'p-2' }] })
    expect(participantsList(state).map(({ displayName }) => displayName)).toEqual(['Анна', 'Анна'])
    expect(state.selfId).toBe('p-1')
  })

  it('applies joined and duplicate events idempotently', () => {
    const joined = { type: 'joined', participant: anna }
    const once = participantsReducer(initialParticipantsState, joined)
    const twice = participantsReducer(once, joined)
    expect(twice.order).toEqual(['p-1'])
  })

  it('updates media state and removes left participants idempotently', () => {
    const state = participantsReducer(initialParticipantsState, { type: 'joined', participant: anna })
    const updated = participantsReducer(state, { type: 'media-state', participantId: 'p-1', audioEnabled: true, videoEnabled: true })
    expect(updated.byId['p-1']).toMatchObject({ audioEnabled: true, videoEnabled: true })
    const left = participantsReducer(updated, { type: 'left', participantId: 'p-1' })
    expect(participantsList(left)).toEqual([])
    expect(participantsReducer(left, { type: 'left', participantId: 'p-1' })).toBe(left)
  })
})
