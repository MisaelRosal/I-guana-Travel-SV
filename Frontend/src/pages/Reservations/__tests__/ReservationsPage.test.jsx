import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import ReservationsPage from '../ReservationsPage.jsx'

// F2b-1 (i18n-es-en): the reservations page reads its chrome from the
// `reservas` namespace (task 4.1 RED — strict-tdd forbids touching
// ReservationsPage.jsx before a failing test exists).
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Status chip in English": with EN active a `estado === 'pendiente'`
//     reservation shows the English label while the stored value remains
//     'pendiente' — the chip is display-only mapping, the payload is never
//     transformed;
//   * "Enum, unit, and badge labels localized": `cupos` resolves through
//     i18next `_one/_other` + `count` (AD-3);
//   * "Overlay subset": `reservas.gate.body` is deliberately ABSENT from
//     en/reservas.json (same partial-rollout precedent as `login.noAccount`
//     from F2a) — it falls back to canonical Spanish, never a raw key;
//   * "Resource-driven interpolation": person counts and capacity sentences
//     come from templates, never JSX concatenation.
// The ES block is the extraction approval test: Spanish is canonical, so the
// UI MUST stay byte-comparable after the literals move into resources.

const fixtures = vi.hoisted(() => ({
  reservas: [
    {
      id: 1, publicacionId: 7, experienciaTitulo: 'Ruta del café en Apan',
      experienciaCategoria: 'Café', experienciaImagen: '', tipo: 'experiencia',
      precioPorNoche: 25, capacidadMaxima: 4, fechasDisponibles: [],
      fechaInicio: '2099-01-15', fechaFin: '2099-01-15', personas: 2,
      precioTotal: 50, estado: 'pendiente', fechaExpiracionGracia: null,
      nombreHuesped: 'Ana Pérez', emailHuesped: 'ana@correo.com', telefonoHuesped: '',
    },
    {
      id: 2, publicacionId: 8, experienciaTitulo: 'Surf en El Sunzal',
      experienciaCategoria: 'Surf', experienciaImagen: '', tipo: 'experiencia',
      precioPorNoche: 25, capacidadMaxima: 6, fechasDisponibles: [],
      fechaInicio: '2099-02-20', fechaFin: '2099-02-20', personas: 1,
      precioTotal: 25, estado: 'confirmada', fechaExpiracionGracia: null,
      nombreHuesped: 'Ana Pérez', emailHuesped: 'ana@correo.com', telefonoHuesped: '',
    },
    {
      id: 3, publicacionId: 9, experienciaTitulo: 'Laguna de las Estrellas',
      experienciaCategoria: 'Naturaleza', experienciaImagen: '', tipo: 'experiencia',
      precioPorNoche: 30, capacidadMaxima: 2, fechasDisponibles: [],
      fechaInicio: '2099-03-05', fechaFin: '2099-03-05', personas: 3,
      precioTotal: 90, estado: 'cancelada', fechaExpiracionGracia: null,
      nombreHuesped: 'Ana Pérez', emailHuesped: 'ana@correo.com', telefonoHuesped: '',
    },
    {
      // Short (<24h) reservation whose one-hour payment grace already expired:
      // exercises the grace-expired note branch (pendiente + fechaExpiracionGracia past).
      id: 4, publicacionId: 7, experienciaTitulo: 'Ruta del café en Apan',
      experienciaCategoria: 'Café', experienciaImagen: '', tipo: 'experiencia',
      precioPorNoche: 25, capacidadMaxima: 4, fechasDisponibles: [],
      fechaInicio: '2099-04-10', fechaFin: '2099-04-10', personas: 2,
      precioTotal: 50, estado: 'pendiente', fechaExpiracionGracia: '2020-06-01T00:00:00Z',
      nombreHuesped: 'Ana Pérez', emailHuesped: 'ana@correo.com', telefonoHuesped: '',
    },
  ],
}))

vi.mock('../../../services/reservas.js', () => ({
  getMisReservas: vi.fn(async () => fixtures.reservas),
  actualizarReserva: vi.fn(async () => ({ ok: true })),
  eliminarReserva: vi.fn(async () => ({ ok: true })),
  pagarReserva: vi.fn(async () => ({ id: 1, mensaje: 'Pago realizado' })),
  cancelarReserva: vi.fn(async () => ({ ok: true })),
}))

function renderReservations() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/reservas']}>
        <ReservationsPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.setItem('iguana_usuario', JSON.stringify({ email: 'ana@correo.com', nombre: 'Ana' }))
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
  sessionStorage.removeItem('iguana_usuario')
})

describe('EN active: reservations chrome comes from the reservas namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('maps stored estado values to EN chip labels without touching the payload', async () => {
    renderReservations()

    // Spec "Status chip in English": display label is mapped, stored value is not.
    expect(await screen.findAllByText('Pending')).toHaveLength(2)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    // The DB values driving those chips are still the originals (display-only).
    expect(fixtures.reservas[0].estado).toBe('pendiente')
    expect(fixtures.reservas[1].estado).toBe('confirmada')
    expect(fixtures.reservas[2].estado).toBe('cancelada')
    // Grouping still filters on the stored values, proving nothing was rewritten.
    const upcoming = screen.getByRole('heading', { name: /Upcoming bookings/ }).closest('section')
    expect(within(upcoming).getAllByText('Pending')).toHaveLength(2)
    expect(screen.queryByText('Pendiente')).toBeNull()
  })

  it('renders the logged-out gate in EN and falls back to Spanish only for the omitted overlay key', async () => {
    sessionStorage.removeItem('iguana_usuario')
    renderReservations()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('My bookings')
    // `gate.body` exists only in es/reservas.json — fallbackLng 'es' resolves it.
    expect(screen.getByText('Debes iniciar sesión para ver tus reservas.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/reservas:/)).toBeNull()
  })

  it('renders localized section chrome, unit labels and status notes through resources', async () => {
    renderReservations()
    await screen.findAllByText('Pending')

    expect(screen.getByText("Here you'll find all your bookings.")).toBeInTheDocument()
    // Interpolated unit templates, not JSX concatenation.
    expect(screen.getAllByText('2 people')).toHaveLength(2)
    expect(screen.getByText('1 person')).toBeInTheDocument()
    expect(screen.getByText('3 people')).toBeInTheDocument()
    // Section headings + per-section empty sentence (resource-driven).
    expect(screen.getByRole('heading', { name: /Upcoming bookings/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Cancelled bookings/ })).toBeInTheDocument()
    expect(screen.getByText('You have no completed bookings.')).toBeInTheDocument()
    // Frontend-owned status notes.
    expect(screen.getByText('This booking has already been cancelled.')).toBeInTheDocument()
    expect(
      screen.getByText('The payment hour expired. This booking will be cancelled automatically.'),
    ).toBeInTheDocument()
    // Action buttons via resources (Cancelar resolves through common).
    // Cancelled/grace-expired cards show notes instead of buttons.
    expect(screen.getAllByRole('button', { name: 'Pay' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
  })

  it('opens the edit modal with EN chrome and localized save feedback', async () => {
    renderReservations()
    await screen.findAllByText('Pending')

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Edit booking' })
    expect(within(dialog).getByText('Current date: 15/01/2099')).toBeInTheDocument()
    expect(within(dialog).getByText('This experience has no available dates yet.')).toBeInTheDocument()
    expect(within(dialog).getByText('Maximum capacity: 4 guests')).toBeInTheDocument()
    // '·' glyph separator stays inline around the interpolated count.
    expect(within(dialog).getByText('$50 · 2 guests')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Booking updated.')
  })

  it('validates the payment form in EN and serves the locale-linguistic expiry placeholder', async () => {
    renderReservations()
    await screen.findAllByText('Pending')

    fireEvent.click(screen.getByRole('button', { name: 'Pay' }))
    expect(await screen.findByText('Simulate payment')).toBeInTheDocument()
    expect(screen.getByText('Booking #1')).toBeInTheDocument()
    expect(screen.getByText('Credit card')).toBeInTheDocument()
    expect(screen.getByText('Debit card')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByText('Select a payment method')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Credit card'))
    // '**** **** **** ****' mask stays inline (glyph policy); MM/AA is linguistic.
    expect(screen.getByPlaceholderText('**** **** **** ****')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('MM/YY')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('As it appears on the card')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }))
    expect(await screen.findByText('Enter the card number')).toBeInTheDocument()

    fireEvent.click(screen.getByText('PayPal'))
    expect(await screen.findByText("You'll be redirected to PayPal to complete the payment.")).toBeInTheDocument()
  })

  it('runs the cancel flow in EN with localized confirmations and toast', async () => {
    renderReservations()
    await screen.findAllByText('Pending')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Cancel booking')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to cancel this booking?')).toBeInTheDocument()
    expect(screen.getByText('Booking #2 — $25')).toBeInTheDocument()
    expect(screen.getByText('Check-in: 20/02/2099')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Booking cancelled successfully.')
    // Local state flips to 'cancelada' -> the chip and grouping follow the value.
    expect(await screen.findAllByText('Cancelled')).toHaveLength(2)
  })

  it('renders the delete confirmation body through Trans keeping DB values verbatim', async () => {
    renderReservations()
    await screen.findAllByText('Pending')

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Confirm deletion' })
    expect(within(dialog).getByText('Delete booking?')).toBeInTheDocument()
    // Trans keeps the styled <b> spans while the full sentence resolves from one
    // resource template; the title stays the stored Spanish value (passthrough).
    expect(
      within(dialog).getByText(
        (_, el) =>
          el?.textContent ===
          'You are about to delete the booking of Ruta del café en Apan for 15/01/2099. This action cannot be undone.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Booking deleted.')
  })
})

describe('cupos plural contract (task 4.1 / AD-3)', () => {
  it('resolves cupos through _one/_other with count in ES and EN', async () => {
    // ES canonical: count=1 corrects the legacy always-plural "1 cupos"
    // (documented AD-3 deviation; the consumer site lives in ExperienceCard
    // and lands with F2b-2 — the contract is proven here at resource level).
    expect(i18n.t('reservas:cupos', { count: 1 })).toBe('1 cupo')
    expect(i18n.t('reservas:cupos', { count: 3 })).toBe('3 cupos')

    await i18n.changeLanguage('en')
    expect(i18n.t('reservas:cupos', { count: 1 })).toBe('1 spot')
    expect(i18n.t('reservas:cupos', { count: 3 })).toBe('3 spots')
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', async () => {
    renderReservations()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Mis reservas')
    expect(screen.getByText('Aquí vas a encontrar todas tus reservas.')).toBeInTheDocument()
    expect(screen.getAllByText('Pendiente')).toHaveLength(2)
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
    expect(screen.getByText('Futuras reservas')).toBeInTheDocument()
    expect(screen.getByText('Reservas canceladas')).toBeInTheDocument()
    expect(screen.getByText('Reservas completadas')).toBeInTheDocument()
    expect(screen.getByText('No tienes reservas completadas.')).toBeInTheDocument()
    // One dl label per card (4 reservations rendered).
    expect(screen.getAllByText('Fecha')).toHaveLength(4)
    expect(screen.getAllByText('Personas')).toHaveLength(4)
    expect(screen.getAllByText('Total')).toHaveLength(4)
    expect(screen.getAllByText('2 personas')).toHaveLength(2)
    expect(screen.getByText('1 persona')).toBeInTheDocument()
    expect(screen.getByText('3 personas')).toBeInTheDocument()
    expect(screen.getByText('Esta reserva ya fue cancelada.')).toBeInTheDocument()
    expect(
      screen.getByText('La hora para pagar venció. Esta reserva se cancelará automáticamente.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pagar' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1)
  })

  it('renders the original edit-modal Spanish literals after extraction', async () => {
    renderReservations()
    await screen.findAllByText('Pendiente')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Editar reserva' })
    expect(within(dialog).getByText('Fecha actual: 15/01/2099')).toBeInTheDocument()
    expect(within(dialog).getByText('Esta experiencia todavía no tiene fechas disponibles.')).toBeInTheDocument()
    expect(within(dialog).getByText('Capacidad máxima: 4 personas')).toBeInTheDocument()
    expect(within(dialog).getByText('$50 · 2 personas')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Menos personas' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Más personas' })).toBeInTheDocument()
  })
})
