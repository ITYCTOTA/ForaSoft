/* eslint-disable no-unused-vars */
import { useEffect, useState } from 'react'

import { validateDisplayName, validateRoomId } from '@video-chat-room/shared'

function roomIdFromPath() {
  const match = window.location.pathname.match(/^\/room\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname)
  const roomId = roomIdFromPath()
  useEffect(() => {
    const refresh = () => setPath(window.location.pathname)
    window.addEventListener('popstate', refresh)
    return () => window.removeEventListener('popstate', refresh)
  }, [])
  return roomId ? <RoomLanding roomId={roomId} /> : <HomePage onNavigate={navigate} />
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
    onNavigate(`/room/${encodeURIComponent(roomResult.value)}`)
  }
  return <main className="app-shell card">
    <h1>Видеочат-комната</h1>
    <p>Создайте комнату или войдите по ссылке.</p>
    <NameField value={name} onChange={(value) => { setName(value); setError('') }} error={error} />
    <button type="button" onClick={() => submit(true)}>Создать комнату</button>
    <div className="join-row">
      <input aria-label="Идентификатор комнаты" placeholder="Идентификатор комнаты" value={roomId} onChange={(event) => setRoomId(event.target.value)} />
      <button type="button" onClick={() => submit(false)}>Войти</button>
    </div>
  </main>
}

function RoomLanding({ roomId }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
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
  }
  return <main className="app-shell card">
    <h1>Комната</h1>
    <p className="invite-url">{inviteUrl}</p>
    <button type="button" onClick={copyInvite}>Скопировать ссылку</button>
    {copied && <span role="status">Ссылка скопирована.</span>}
    <NameField value={name} onChange={(value) => { setName(value); setError('') }} error={error} />
    <button type="button" onClick={join}>Войти</button>
    <small>Идентификатор комнаты: {roomId}</small>
  </main>
}
