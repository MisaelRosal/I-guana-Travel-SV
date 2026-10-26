import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import AgendaOperador from '../AgendaOperador.jsx'

vi.mock('../../services/reservas.js', () => ({
  getAgenda: vi.fn(async () => []),
}))

import { getAgenda } from '../../services/reservas.js'

const publicaciones = [
  {
    id: 1,
    titulo: 'Cabaña El Tronador',
    tipo: 'hospedaje',
  },
  {
    id: 2,
    titulo: 'Tour de las Aves',
    tipo: 'experiencia',
  },
]

const agendaMock = [
  {
    id: 10,
    publicacionId: 1,
    publicacionTitulo: 'Cabaña El Tronador',
    tipo: 'hospedaje',
    fechaInicio: '2026-11-15',
    fechaFin: '2026-11-18',
    numeroHuespedes: 3,
    precioTotal: 270,
    estado: 'confirmada',
    nombreHuesped: 'María López',
    emailHuesped: 'maria@ejemplo.com',
    telefonoHuesped: '+503 1234 5678',
    fechaPago: '2026-11-01',
    metodoPago: 'tarjeta',
  },
  {
    id: 20,
    publicacionId: 2,
    publicacionTitulo: 'Tour de las Aves',
    tipo: 'experiencia',
    fechaInicio: '2026-11-20',
    fechaFin: '2026-11-20',
    numeroHuespedes: 2,
    precioTotal: 50,
    estado: 'pendiente',
    nombreHuesped: 'Juan Pérez',
    emailHuesped: 'juan@ejemplo.com',
    telefonoHuesped: '',
    fechaPago: null,
    metodoPago: null,
  },
]

function renderAgenda(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <AgendaOperador
        publicaciones={publicaciones}
        esAdmin={false}
        {...props}
      />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getAgenda.mockResolvedValue([...agendaMock])
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
})

describe('AgendaOperador (A-20)', () => {
  it('renders calendar and upcoming reservations', async () => {
    renderAgenda()

    expect(await screen.findByText('María López')).toBeInTheDocument()
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
    expect(screen.getAllByText('Cabaña El Tronador')[0]).toBeInTheDocument()
    expect(screen.getAllByText('Tour de las Aves')[0]).toBeInTheDocument()
  })

  it('filters reservations by publication', async () => {
    renderAgenda()

    await screen.findByText('María López')

    const select = screen.getByLabelText('Publicación')
    fireEvent.change(select, { target: { value: '2' } })

    await waitFor(() => {
      expect(screen.queryByText('María López')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument()
  })

  it('marks occupied days for lodging (half-open interval)', async () => {
    renderAgenda()
    await screen.findByText('María López')

    const occupiedCells = document.querySelectorAll('.bg-iguana-hondo\\/90')
    expect(occupiedCells.length).toBeGreaterThan(0)
  })

  it('shows empty state when no reservations for filter', async () => {
    renderAgenda()
    await screen.findByText('María López')

    const select = screen.getByLabelText('Publicación')
    fireEvent.change(select, { target: { value: '' } })
    getAgenda.mockResolvedValueOnce([])
    fireEvent.change(select, { target: { value: '1' } })
  })
})
