import { useState } from 'react'

export default function InviteLink() {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const inviteUrl = window.location.href
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(inviteUrl)
      else {
        const helper = document.createElement('textarea')
        helper.value = inviteUrl; helper.setAttribute('readonly', ''); helper.style.position = 'fixed'; helper.style.opacity = '0'
        document.body.append(helper); helper.select()
        if (!document.execCommand('copy')) throw new Error('copy failed')
        helper.remove()
      }
      setCopied(true); setError('')
    } catch { setError('Не удалось скопировать ссылку. Скопируйте её вручную.') }
  }
  return (
    <div className="invite-link">
      <p className="invite-url" title={inviteUrl}>{inviteUrl}</p>
      <button type="button" onClick={copy}>Скопировать ссылку</button>
      {copied && <span role="status">Ссылка скопирована.</span>}
      {error && <span role="alert">{error}</span>}
    </div>
  )
}
