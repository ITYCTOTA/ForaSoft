/* eslint-disable no-unused-vars */
import { useReducer, useRef, useState } from 'react'
import { validateDisplayName } from '@video-chat-room/shared'
import ChatPanel from '../features/room/ui/ChatPanel.jsx'
import InviteLink from '../features/room/ui/InviteLink.jsx'
import NameField from '../shared/ui/NameField.jsx'
import ParticipantList from '../entities/participant/ui/ParticipantList.jsx'
import { initialMessagesState, messagesList, messagesReducer } from '../features/room/model/messages.js'
import { initialParticipantsState, participantsList, participantsReducer } from '../entities/participant/model/participants.js'
import { RoomSession } from '../features/room/model/roomSession.js'
import { MediaController } from '../features/room/model/mediaController.js'

export default function RoomPage({ roomId, initialName = '' }) {
  const [name, setName] = useState(initialName); const [error, setError] = useState(''); const [sessionState, setSessionState] = useState({ status: 'idle' }); const [messageText, setMessageText] = useState('')
  const [participants, dispatchParticipants] = useReducer(participantsReducer, initialParticipantsState); const [messages, dispatchMessages] = useReducer(messagesReducer, initialMessagesState); const sessionRef = useRef(null); const mediaRef = useRef(null)
  const handleState = (state) => { setSessionState(state); if (state.status === 'joined') { dispatchParticipants({ type: 'snapshot', selfId: state.self.id, participants: state.participants }); dispatchMessages({ type: 'snapshot', messages: state.messages }) }; if (state.status === 'participant-joined') dispatchParticipants({ type: 'joined', participant: state.participant }); if (state.status === 'participant-left') dispatchParticipants({ type: 'left', participantId: state.participantId }); if (state.status === 'media-state') dispatchParticipants({ type: 'media-state', ...state }); if (state.status === 'chat-message') dispatchMessages({ type: 'add', message: state.message }) }
  const join = async () => { const result = validateDisplayName(name); if (!result.ok) return setError(result.message); if (!mediaRef.current) mediaRef.current = new MediaController(); const media = await mediaRef.current.acquire(); setError(media.error ?? ''); if (!sessionRef.current) sessionRef.current = new RoomSession({ onState: handleState }); sessionRef.current.join({ roomId, displayName: result.value }) }
  const sendMessage = async (event) => { event.preventDefault(); if (!messageText.trim() || !sessionRef.current) return; const result = await sessionRef.current.sendChat(messageText); if (result?.ok) setMessageText(''); else if (result?.message) setError(result.message) }
  const visibleMessages = messagesList(messages)
  return <main className="app-shell card"><h1>Комната</h1><InviteLink /><NameField value={name} onChange={(value) => { setName(value); setError('') }} error={error} /><button type="button" onClick={join}>Войти</button>{sessionState.status === 'joined' && <span role="status">Вы вошли в комнату.</span>}{sessionState.status === 'disconnected' && <span role="alert">{sessionState.error}</span>}<ParticipantList participants={participantsList(participants)} />{visibleMessages.length > 0 && <ChatPanel messages={visibleMessages} value={messageText} onChange={setMessageText} onSubmit={sendMessage} />}<small>Идентификатор комнаты: {roomId}</small></main>
}
