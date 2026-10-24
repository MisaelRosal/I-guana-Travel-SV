import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/config.js'

const mocks = vi.hoisted(() => ({
  getNoLeidos: vi.fn(),
  getMias: vi.fn(),
  getMensajes: vi.fn(),
  marcarLeido: vi.fn(),
  session: { id: 10, nombre: 'Ana', apellido: 'Viajera', rol: 'usuario' },
}))

vi.mock('../../services/chat.js', () => ({
  getNoLeidos: mocks.getNoLeidos,
  getMias: mocks.getMias,
  getMensajes: mocks.getMensajes,
  marcarLeido: mocks.marcarLeido,
}))
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
  mocks.getMias.mockResolvedValue([{
    conversacion_id: 22,
    contra_nombre: 'Ana Host',
    contra_foto: null,
    ultimo_mensaje_texto: 'Latest message',
    ultimo_mensaje_en: '2026-01-01T12:00:00',
    no_leidos: 2,
  }])
  mocks.getMensajes.mockResolvedValue({ mensajes: [], cursor: null })
  mocks.marcarLeido.mockResolvedValue({})
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('Header unread chat badge', () => {
  it('polls every 15 seconds, pauses while hidden, and refreshes on return', async () => {
    renderHeader()
    await act(async () => {})

    expect(mocks.getNoLeidos).toHaveBeenCalledOnce()
    expect(screen.queryByRole('link', { name: 'Mensajes — 2 mensajes sin leer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir mensajes — 2 mensajes sin leer' })).toBeInTheDocument()

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

  it('shows an accessible floating launcher when signed in and returns focus after Escape', async () => {
    renderHeader()
    await act(async () => {})
    const launcher = screen.getByRole('button', { name: 'Abrir mensajes — 2 mensajes sin leer' })

    launcher.focus()
    fireEvent.click(launcher)
    const dialog = screen.getByRole('dialog', { name: 'Tus mensajes' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'message-inbox-dialog-title')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: 'Tus mensajes' })).not.toBeInTheDocument()
    expect(launcher).toHaveFocus()

    fireEvent.click(launcher)
    const reopenedDialog = screen.getByRole('dialog', { name: 'Tus mensajes' })
    fireEvent.keyDown(reopenedDialog, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Abrir mensajes — 2 mensajes sin leer' })).toHaveFocus()
    expect(screen.queryByRole('dialog', { name: 'Tus mensajes' })).not.toBeInTheDocument()
  })

  it('loads and selects a conversation inside the modal without navigating', async () => {
    renderHeader()
    await act(async () => {})
    const launcher = screen.getByRole('button', { name: 'Abrir mensajes — 2 mensajes sin leer' })
    await act(async () => {
      fireEvent.click(launcher)
      await Promise.resolve()
    })

    expect(screen.getByText('Latest message')).toBeInTheDocument()
    expect(mocks.getMias).toHaveBeenCalledOnce()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir conversación' }))
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: 'Ana Host' })).toBeInTheDocument()
    expect(mocks.getMensajes).toHaveBeenCalledWith(22, null, 'es')
    expect(screen.getByRole('button', { name: 'Abrir mensajes — 2 mensajes sin leer' })).toBeInTheDocument()
  })

  it('hides the floating launcher when signed out', async () => {
    mocks.session = null
    renderHeader()
    await act(async () => {})

    expect(screen.queryByRole('button', { name: /Abrir mensajes/ })).not.toBeInTheDocument()
    expect(mocks.getNoLeidos).not.toHaveBeenCalled()
  })
})
