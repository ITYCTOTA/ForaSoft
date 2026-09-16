import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App.jsx'

describe('App', () => {
  it('renders the client scaffold', () => {
    render(createElement(App))

    expect(screen.getByRole('heading', { name: 'Видеочат-комната' })).toBeInTheDocument()
  })
})
