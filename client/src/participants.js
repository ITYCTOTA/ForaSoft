export const initialParticipantsState = Object.freeze({ byId: {}, order: [], selfId: null })

function upsert(state, participant) {
  if (!participant?.id) return state
  const exists = Object.hasOwn(state.byId, participant.id)
  return {
    ...state,
    byId: { ...state.byId, [participant.id]: { ...(state.byId[participant.id] ?? {}), ...participant } },
    order: exists ? state.order : [...state.order, participant.id],
  }
}

export function participantsReducer(state = initialParticipantsState, action) {
  switch (action.type) {
    case 'snapshot': {
      const next = { ...initialParticipantsState, selfId: action.selfId ?? null }
      return (action.participants ?? []).reduce(upsert, next)
    }
    case 'joined':
      return upsert(state, action.participant)
    case 'media-state': {
      const participant = state.byId[action.participantId]
      return participant ? upsert(state, { ...participant, audioEnabled: action.audioEnabled, videoEnabled: action.videoEnabled }) : state
    }
    case 'left': {
      if (!Object.hasOwn(state.byId, action.participantId)) return state
      const byId = { ...state.byId }
      delete byId[action.participantId]
      return { ...state, byId, order: state.order.filter((id) => id !== action.participantId), selfId: state.selfId === action.participantId ? null : state.selfId }
    }
    default:
      return state
  }
}

export function participantsList(state) {
  return state.order.map((id) => state.byId[id]).filter(Boolean)
}
