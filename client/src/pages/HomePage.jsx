/* eslint-disable no-unused-vars */
import { useState } from 'react'
import { validateDisplayName, validateRoomId } from '@video-chat-room/shared'
import NameField from '../shared/ui/NameField.jsx'

export default function HomePage({ onNavigate }) {
  const [name, setName] = useState(''); const [roomId, setRoomId] = useState(''); const [error, setError] = useState('')
  const submit = (create) => {
    const nameResult = validateDisplayName(name)
    if (!nameResult.ok) return setError(nameResult.message)
    const roomResult = validateRoomId(create ? crypto.randomUUID() : roomId.trim())
    if (!roomResult.ok) return setError(roomResult.message)
    onNavigate(`/room/${encodeURIComponent(roomResult.value)}`, nameResult.value)
  }
  return <main className="app-shell card"><h1>Видеочат-комната</h1><p>Введите имя и выберите действие.</p><NameField value={name} onChange={(value) => { setName(value); setError('') }} error={error} /><label className="field">ID комнаты<div className="join-row"><input aria-label="Идентификатор комнаты" placeholder="Введите ID комнаты" value={roomId} onChange={(event) => setRoomId(event.target.value)} /><button type="button" onClick={() => submit(false)}>Войти</button></div></label><div className="action-divider"><span>или</span></div><button type="button" onClick={() => submit(true)}>Создать комнату</button></main>
}
