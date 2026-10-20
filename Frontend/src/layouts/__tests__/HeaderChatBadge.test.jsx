import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/config.js'

const mocks = vi.hoisted(() => ({ getNoLeidos: vi.fn(), session: { id: 10, nombre: 'Ana', apellido: 'Viajera', rol: 'usuario' } }))

vi.mock('../../services/chat.js', () => ({ getNoLeidos: mocks.getNoLeidos }))
vi.mock('../../services/anfitriones.js', () => ({
  esAdmin: (rol) => rol === 'admin',
  getMiPerfil: vi.fn(),
}))
vi.mock('../../services/session.js', () => ({
  leerSesionCache: () => mocks.session,
  restaurarSesion: vi.fn(async () => mocks.session),
  cerrarSesion: vi.fn(),
}))

import Header from '../Header.jsx'

function renderHeader() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.session = { id: 10, nombre: 'Ana', apellido: 'Viajera', rol: 'usuario' }
  mocks.getNoLeidos.mockResolvedValue({ total: 2 })
})

afterEach(async () => {
  vi.useRealTimers()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('Header unread chat badge', () => {
  it('polls every 15 seconds, pauses while hidden, and refreshes on return', async () => {
    renderHeader()
    await act(async () => {})

    expect(mocks.getNoLeidos).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Mensajes — 2 mensajes sin leer' })).toBeInTheDocument()

    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(mocks.getNoLeidos).toHaveBeenCalledTimes(2)

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(mocks.getNoLeidos).toHaveBeenCalledTimes(2)

    hidden.mockReturnValue(false)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(mocks.getNoLeidos).toHaveBeenCalledTimes(3)
    hidden.mockRestore()
  })
})
