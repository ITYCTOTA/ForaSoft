import { createElement } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App.jsx'

describe('App', () => {
  it('renders the client scaffold', () => {
    render(createElement(App))

    expect(screen.getByRole('heading', { name: 'Видеочат-комната' })).toBeInTheDocument()
  })

  it('requires a name and creates a room URL on explicit action', () => {
    window.history.pushState({}, '', '/')
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111')
    render(createElement(App))
    fireEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Введите отображаемое имя.')
    fireEvent.change(screen.getByLabelText('Отображаемое имя'), { target: { value: 'Анна' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))
    expect(window.location.pathname).toBe('/room/11111111-1111-4111-8111-111111111111')
    crypto.randomUUID.mockRestore()
  })

  it('copies the invite URL only after clicking copy', async () => {
    window.history.pushState({}, '', '/room/test-room')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(createElement(App))
    expect(writeText).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' })) })
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href))
  })
})
