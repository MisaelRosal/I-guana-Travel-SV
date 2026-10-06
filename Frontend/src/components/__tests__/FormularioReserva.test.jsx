import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import FormularioReserva from '../FormularioReserva.jsx'

// F2b-2 (i18n-es-en) task 4.3 RED — the booking form modal reads its chrome
// from the `experiencia` namespace. Specs:
//   * "Localized text nodes" / "Localized accessibility names": labels and
//     the dialog accessible name come from EN resources when EN is active;
//   * "Resource-driven interpolation": the nights/people summary segments are
//     `_one/_other` templates, never `x > 1 ? 's' : ''` JSX concatenation;
//   * "User and DB content passthrough": experience title and backend error
//     `mensaje` render verbatim in any locale;
//   * "Overlay subset": raw keys never surface.
// The ES block is the extraction approval test (Spanish byte-comparable).
// The ` · ` and ` → ` separators stay inline glyphs (policy), the words come
// from resources, so paragraph assertions match the full concatenated text.

const fixtures = vi.hoisted(() => ({
  experiencia: {
    id: 11, titulo: 'Ruta del café en Apan', tipo: 'experiencia', precio: 25, capacidad: 8,
  },
  hospedaje: {
    id: 10, titulo: 'Casa frente al mar en El Tunco', tipo: 'hospedaje', precio: 120, capacidad: 4,
  },
}))

vi.mock('../../services/reservas.js', () => ({
  crearReserva: vi.fn(async () => ({ id: 99 })),
}))

import { crearReserva } from '../../services/reservas.js'

function renderForm(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <FormularioReserva
          experiencia={fixtures.experiencia}
          fechaInicio="2099-01-15"
          fechaFin={null}
          numPersonas={2}
          onCancelar={() => {}}
          onReservada={() => {}}
          {...props}
        />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.setItem(
    'iguana_usuario',
    JSON.stringify({ nombre: 'Ana', apellido: 'Pérez', email: 'ana@correo.com', telefono: '' }),
  )
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
  sessionStorage.removeItem('iguana_usuario')
  vi.clearAllMocks()
})

describe('EN active: booking form chrome comes from the experiencia namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders labels and the pluralized guest segment from EN resources', async () => {
    renderForm()

    const dialog = await screen.findByRole('dialog', { name: 'Booking form' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Complete your booking')).toBeInTheDocument()
    // Guest segment through the _one/_other contract (2 -> "people").
    expect(screen.getByText('14/01/2099 · 2 people')).toBeInTheDocument()
    expect(screen.getByText("You'll be booking as:")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument()
    // Stored experience title stays verbatim Spanish under EN.
    expect(screen.getByText('Ruta del café en Apan')).toBeInTheDocument()
    expect(screen.queryByText(/experiencia:/)).toBeNull()
  })

  it('renders the nights segment through its own plural template', () => {
    renderForm({
      experiencia: fixtures.hospedaje,
      fechaInicio: '2099-02-10',
      fechaFin: '2099-02-13',
      numPersonas: 3,
    })

    expect(screen.getByText('09/02/2099 → 12/02/2099 · 3 nights')).toBeInTheDocument()

    cleanup()
    renderForm({ numPersonas: 1 })
    // Singular branch of the guest template.
    expect(screen.getByText('14/01/2099 · 1 person')).toBeInTheDocument()
  })

  it('shows the localized sign-in gate for anonymous visitors', async () => {
    sessionStorage.removeItem('iguana_usuario')
    renderForm()

    expect(await screen.findByText('You need to sign in to book')).toBeInTheDocument()
    expect(
      screen.getByText('Sign in or create an account to confirm your booking.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument()
  })

  it('renders success, verbatim backend error and localized fallback toasts', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Booking created successfully!')

    cleanup()
    // Backend `mensaje` is passthrough: shown exactly as received, in EN.
    crearReserva.mockRejectedValueOnce({ mensaje: 'No autorizado' })
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByRole('status')).toHaveTextContent('No autorizado')

    cleanup()
    // No server message at all: the frontend-owned fallback resolves from resources.
    crearReserva.mockRejectedValueOnce({})
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Error creating the booking.')
  })
})

describe('ES active: extraction keeps the canonical Spanish form byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', async () => {
    renderForm()

    expect(await screen.findByRole('dialog', { name: 'Formulario de reserva' })).toBeInTheDocument()
    expect(screen.getByText('Completá tu reserva')).toBeInTheDocument()
    expect(screen.getByText('14/01/2099 · 2 personas')).toBeInTheDocument()
    expect(screen.getByText('Vas a reservar como:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar reserva' })).toBeInTheDocument()

    cleanup()
    renderForm({
      experiencia: fixtures.hospedaje,
      fechaInicio: '2099-02-10',
      fechaFin: '2099-02-13',
      numPersonas: 3,
    })
    expect(await screen.findByText('09/02/2099 → 12/02/2099 · 3 noches')).toBeInTheDocument()
  })

  it('renders the original Spanish sign-in gate', async () => {
    sessionStorage.removeItem('iguana_usuario')
    renderForm()

    expect(await screen.findByText('Necesitás iniciar sesión para reservar')).toBeInTheDocument()
    expect(
      screen.getByText('Inicia sesión o crea una cuenta para poder confirmar tu reserva.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrarse' })).toBeInTheDocument()
  })
})
