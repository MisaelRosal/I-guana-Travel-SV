import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import DashboardGanancias from '../DashboardGanancias.jsx'

// Host earnings dashboard (W6). The component reads its chrome from the `panel`
// namespace (`dashboard.*`) and every figure from the /Dashboard/ganancias
// response reached through services/dashboard.js. Specs honoured here:
//   * localized chrome: labels/headers/period buttons come from resources and
//     raw keys never surface;
//   * DB passthrough: listing titles and the type label render verbatim;
//   * the Día/Semana/Mes filter re-queries the server with the picked `periodo`;
//   * empty and error payloads degrade to the localized empty/error states.

const PUBLICACIONES = [
  { id: 1, titulo: 'Ruta del café' },
  { id: 2, titulo: 'Cabaña frente al lago' },
]

const mocks = vi.hoisted(() => ({ getGanancias: vi.fn() }))

vi.mock('../../services/dashboard.js', () => ({
  getGanancias: mocks.getGanancias,
}))

const DATOS = {
  periodo: 'mes',
  desde: '2026-09-01',
  hasta: '2026-10-12',
  moneda: 'USD',
  total: 300,
  totalReservas: 6,
  promedio: 50,
  totalGeneral: 300,
  series: [
    { inicio: '2026-09-01', total: 100, reservas: 2 },
    { inicio: '2026-10-01', total: 200, reservas: 4 },
  ],
  porPublicacion: [
    { publicacionId: 1, titulo: 'Ruta del café', tipo: 'experiencia', total: 200, reservas: 4 },
    { publicacionId: 2, titulo: 'Cabaña frente al lago', tipo: 'hospedaje', total: 100, reservas: 2 },
  ],
}

const VACIO = {
  periodo: 'mes', desde: '2026-10-01', hasta: '2026-10-12', moneda: 'USD',
  total: 0, totalReservas: 0, promedio: 0, totalGeneral: 0,
  series: [{ inicio: '2026-10-01', total: 0, reservas: 0 }], porPublicacion: [],
}

function renderDash(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <DashboardGanancias publicaciones={PUBLICACIONES} {...props} />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mocks.getGanancias.mockReset()
  mocks.getGanancias.mockResolvedValue(DATOS)
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: dashboard chrome and figures come from resources', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders summary cards, the per-listing table and the type labels', async () => {
    renderDash()

    expect(await screen.findByText('Period total')).toBeInTheDocument()
    // "Reservations" labels both the card and the table column.
    expect(screen.getAllByText('Reservations').length).toBeGreaterThan(0)
    expect(screen.getByText('Average per reservation')).toBeInTheDocument()
    expect(screen.getByText('All-time total')).toBeInTheDocument()

    // "$300" appears twice: period total and all-time total.
    expect(screen.getAllByText('$300')).toHaveLength(2)
    expect(screen.getByText('$50')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()

    // Period selector + publication filter are localized controls.
    expect(screen.getByRole('button', { name: 'Day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All listings' })).toBeInTheDocument()

    // Per-listing table: DB title passthrough + localized type label.
    const table = screen.getByRole('table')
    expect(within(table).getByText('Ruta del café')).toBeInTheDocument()
    expect(within(table).getByText('Experience')).toBeInTheDocument()
    expect(within(table).getByText('Lodging')).toBeInTheDocument()

    expect(screen.queryByText(/panel:/)).toBeNull()
  })

  it('re-queries the server with the picked period', async () => {
    renderDash()
    await screen.findByText('Period total')

    fireEvent.click(screen.getByRole('button', { name: 'Day' }))

    await waitFor(() =>
      expect(mocks.getGanancias).toHaveBeenCalledWith({ periodo: 'dia', publicacionId: '' }),
    )
  })

  it('queries with the chosen publication when one is selected', async () => {
    renderDash()
    await screen.findByText('Period total')

    fireEvent.change(screen.getByLabelText('Listing'), { target: { value: '2' } })

    await waitFor(() =>
      expect(mocks.getGanancias).toHaveBeenCalledWith({ periodo: 'mes', publicacionId: '2' }),
    )
  })

  it('degrades to the localized empty state when there are no earnings', async () => {
    mocks.getGanancias.mockResolvedValue(VACIO)
    renderDash()

    // chart.empty and table.empty share the EN copy.
    expect(await screen.findAllByText('No earnings in this period.')).toHaveLength(2)
  })

  it('degrades to the localized error state when the request fails', async () => {
    mocks.getGanancias.mockRejectedValue(new Error('boom'))
    renderDash()

    expect(await screen.findByText('The earnings could not be loaded.')).toBeInTheDocument()
  })

  it('shows the admin note only for admin callers', async () => {
    renderDash({ esAdmin: true })
    expect(await screen.findByText('You are viewing the earnings of every listing.')).toBeInTheDocument()
  })
})

describe('ES active: canonical Spanish dashboard copy', () => {
  it('renders the Spanish labels and empty state', async () => {
    renderDash()
    expect(await screen.findByText('Total del período')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Día' })).toBeInTheDocument()
    expect(screen.getAllByText('Reservas').length).toBeGreaterThan(0)
    expect(screen.queryByText(/panel:/)).toBeNull()
  })
})
