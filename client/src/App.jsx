/* eslint-disable no-unused-vars */
import { useEffect, useReducer, useRef, useState } from 'react'

import { validateDisplayName, validateRoomId } from '@video-chat-room/shared'

import { RoomSession } from './roomSession.js'
import { initialParticipantsState, participantsList, participantsReducer } from './participants.js'

function roomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function App() {
  const [route, setRoute] = useState({ path: window.location.pathname, initialName: '' })
  const roomId = roomIdFromPath()
  useEffect(() => {
    const refresh = () => setRoute({ path: window.location.pathname, initialName: '' })
    window.addEventListener('popstate', refresh)
    return () => window.removeEventListener('popstate', refresh)
  }, [])
  const goTo = (nextPath, initialName = '') => {
    navigate(nextPath)
    setRoute({ path: nextPath, initialName })
  }
  return roomId ? <RoomLanding roomId={roomId} initialName={route.initialName} /> : <HomePage onNavigate={goTo} />
}

function NameField({ value, onChange, error }) {
  return <label className="field">Отображаемое имя
    <input aria-label="Отображаемое имя" value={value} onChange={(event) => onChange(event.target.value)} maxLength={60} autoComplete="off" />
    {error && <span className="field-error" role="alert">{error}</span>}
  </label>
}

function HomePage({ onNavigate }) {
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const submit = (create) => {
    const nameResult = validateDisplayName(name)
    if (!nameResult.ok) return setError(nameResult.message)
    const id = create ? crypto.randomUUID() : roomId.trim()
    const roomResult = validateRoomId(id)
    if (!roomResult.ok) return setError(roomResult.message)
    onNavigate(`/room/${encodeURIComponent(roomResult.value)}`, nameResult.value)
  }
  return <main className="app-shell card">
    <h1>Видеочат-комната</h1>
    <p>Введите имя и выберите действие.</p>
    <NameField value={name} onChange={(value) => { setName(value); setError('') }} error={error} />
    <div className="join-block">
      <label className="field">ID комнаты
        <div className="join-row">
          <input aria-label="Идентификатор комнаты" placeholder="Введите ID комнаты" value={roomId} onChange={(event) => setRoomId(event.target.value)} />
          <button type="button" onClick={() => submit(false)}>Войти</button>
        </div>
      </label>
    </div>
    <div className="action-divider"><span>или</span></div>
    <button type="button" onClick={() => submit(true)}>Создать комнату</button>
  </main>
}

function RoomLanding({ roomId, initialName = '' }) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [sessionState, setSessionState] = useState({ status: 'idle' })
  const [participants, dispatchParticipants] = useReducer(participantsReducer, initialParticipantsState)
  const sessionRef = useRef(null)
  const inviteUrl = window.location.href
  const copyInvite = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteUrl)
      else {
        const helper = document.createElement('textarea')
        helper.value = inviteUrl
        helper.setAttribute('readonly', '')
        helper.style.position = 'fixed'
        helper.style.opacity = '0'
        document.body.append(helper)
        helper.select()
        if (!document.execCommand('copy')) throw new Error('copy failed')
        helper.remove()
      }
      setCopied(true)
    } catch {
      setError('Не удалось скопировать ссылку. Скопируйте её вручную.')
    }
  }
  const join = () => {
    const result = validateDisplayName(name)
    if (!result.ok) return setError(result.message)
    setError('')
    if (!sessionRef.current) sessionRef.current = new RoomSession({ onState: (state) => {
      setSessionState(state)
      if (state.status === 'joined') dispatchParticipants({ type: 'snapshot', selfId: state.self.id, participants: state.participants })
      if (state.status === 'participant-joined') dispatchParticipants({ type: 'joined', participant: state.participant })
      if (state.status === 'participant-left') dispatchParticipants({ type: 'left', participantId: state.participantId })
      if (state.status === 'media-state') dispatchParticipants({ type: 'media-state', ...state })
    } })
    sessionRef.current.join({ roomId, displayName: result.value })
  }
  return <main className="app-shell card">
    <h1>Комната</h1>
    <p className="invite-url">{inviteUrl}</p>
    <button type="button" onClick={copyInvite}>Скопировать ссылку</button>
    {copied && <span role="status">Ссылка скопирована.</span>}
    <NameField value={name} onChange={(value) => { setName(value); setError('') }} error={error} />
    <button type="button" onClick={join}>Войти</button>
    {sessionState.status === 'joined' && <span role="status">Вы вошли в комнату.</span>}
    {sessionState.status === 'disconnected' && <span role="alert">{sessionState.error}</span>}
    {participantsList(participants).length > 0 && <section aria-label="Участники">
      <h2>Участники</h2>
      <ul>{participantsList(participants).map((participant) => <li key={participant.id}>{participant.displayName}</li>)}</ul>
    </section>}
    <small>Идентификатор комнаты: {roomId}</small>
  </main>
}
