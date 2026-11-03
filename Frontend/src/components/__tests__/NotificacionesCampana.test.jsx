import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import { useNotificaciones } from '../../hooks/useNotificaciones.js'

const mocks = vi.hoisted(() => ({
  getMisNotificaciones: vi.fn(),
  marcarNotificacionLeida: vi.fn(),
  marcarTodasLeidas: vi.fn(),
}))

vi.mock('../../services/notificaciones.js', () => ({
  getMisNotificaciones: mocks.getMisNotificaciones,
  marcarNotificacionLeida: mocks.marcarNotificacionLeida,
  marcarTodasLeidas: mocks.marcarTodasLeidas,
}))

import NotificacionesCampana from '../NotificacionesCampana.jsx'

// Harness mirroring Header's wiring: the poll state comes from the real hook
// (services mocked), and campana receives it as a single `datos` prop.
function renderCampana() {
  function CampanaConEncuesta() {
    const datos = useNotificaciones(true)
    return <NotificacionesCampana datos={datos} />
  }
  return render(
    <I18nextProvider i18n={i18n}>
      <CampanaConEncuesta />
    </I18nextProvider>,
  )
}

const inbox = () => ({
  notificaciones: [
    { id: 7, tipo: 'reserva_confirmada', mensaje: 'Tu reserva fue confirmada.', leida: false, creadoEn: '2026-11-03T10:00:00' },
    { id: 8, tipo: 'checkin_manana', mensaje: 'Tu check-in es mañana.', leida: true, creadoEn: '2026-11-02T18:30:00' },
  ],
  sinLeer: 1,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMisNotificaciones.mockResolvedValue(inbox())
  mocks.marcarNotificacionLeida.mockResolvedValue(null)
  mocks.marcarTodasLeidas.mockResolvedValue({ cantidad: 1 })
})

afterEach(() => {
  cleanup()
  if (i18n.language !== 'es') {
    i18n.changeLanguage('es')
  }
})

describe('NotificacionesCampana', () => {
  it('renders the bell without opening the panel until it is clicked', async () => {
    mocks.getMisNotificaciones.mockResolvedValue({ notificaciones: [], sinLeer: 0 })
    renderCampana()

    const bell = await screen.findByRole('button', { name: 'Notificaciones' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(bell)
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('shows fetched mensajes (server Spanish as-is) and the unread badge after opening', async () => {
    renderCampana()

    // Unread badge pill from the first poll tick.
    expect(await screen.findByText('1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    expect(await screen.findByText('Tu reserva fue confirmada.')).toBeInTheDocument()
    expect(screen.getByText('Tu check-in es mañana.')).toBeInTheDocument()
  })

  it('marks a row read through the service when clicked', async () => {
    renderCampana()
    await screen.findByText('1')
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    fireEvent.click(await screen.findByText('Tu reserva fue confirmada.'))

    await waitFor(() => {
      expect(mocks.marcarNotificacionLeida).toHaveBeenCalledWith(7)
    })
  })

  it('marks every notification read from the panel header button', async () => {
    renderCampana()
    await screen.findByText('1')
    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar todas' }))

    await waitFor(() => {
      expect(mocks.marcarTodasLeidas).toHaveBeenCalledOnce()
    })
  })
})
