import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/config.js'

const mocks = vi.hoisted(() => ({
  cerrarSesion: vi.fn(async () => {}),
  getNoLeidos: vi.fn(),
  getMisNotificaciones: vi.fn(),
  session: { id: 10, nombre: 'Ana', apellido: 'Viajera', rol: 'usuario' },
}))

vi.mock('../../services/chat.js', () => ({
  getNoLeidos: mocks.getNoLeidos,
  getMias: vi.fn(async () => []),
  getMensajes: vi.fn(async () => ({ mensajes: [], cursor: null })),
  marcarLeido: vi.fn(async () => ({})),
}))
vi.mock('../../services/notificaciones.js', () => ({
  getMisNotificaciones: mocks.getMisNotificaciones,
  marcarNotificacionLeida: vi.fn(async () => null),
  marcarTodasLeidas: vi.fn(async () => ({ cantidad: 0 })),
}))
vi.mock('../../services/anfitriones.js', () => ({
  esAdmin: (rol) => rol === 'admin',
  getMiPerfil: vi.fn(async () => null),
}))
vi.mock('../../services/session.js', () => ({
  leerSesionCache: () => mocks.session,
  restaurarSesion: vi.fn(async () => mocks.session),
  cerrarSesion: mocks.cerrarSesion,
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

// Abre el menú del avatar y devuelve el ítem de cerrar sesión.
async function abrirMenuDeUsuario() {
  renderHeader()
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: /Ana Viajera/ }))
  return screen.getByRole('menuitem', { name: 'Cerrar sesión' })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.session = { id: 10, nombre: 'Ana', apellido: 'Viajera', rol: 'usuario' }
  mocks.getNoLeidos.mockResolvedValue({ total: 0 })
  mocks.getMisNotificaciones.mockResolvedValue({ notificaciones: [], sinLeer: 0 })
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('Header sign out confirmation', () => {
  it('asks for confirmation instead of signing out on the first click', async () => {
    const item = await abrirMenuDeUsuario()

    fireEvent.click(item)

    expect(mocks.cerrarSesion).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '¿Cerrar sesión?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // El foco arranca en Cancelar: la acción segura es la que queda enfocada.
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('keeps the session when the user cancels', async () => {
    const item = await abrirMenuDeUsuario()
    fireEvent.click(item)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog', { name: '¿Cerrar sesión?' })).toBeNull()
    expect(mocks.cerrarSesion).not.toHaveBeenCalled()
  })

  it('closes on Escape without signing out', async () => {
    const item = await abrirMenuDeUsuario()
    fireEvent.click(item)

    fireEvent.keyDown(screen.getByRole('dialog', { name: '¿Cerrar sesión?' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '¿Cerrar sesión?' })).toBeNull()
    expect(mocks.cerrarSesion).not.toHaveBeenCalled()
  })

  it('signs out only after the user confirms', async () => {
    const item = await abrirMenuDeUsuario()
    fireEvent.click(item)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    })

    expect(mocks.cerrarSesion).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: '¿Cerrar sesión?' })).toBeNull()
  })
})
