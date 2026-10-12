import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import ExperienceDetailPage from '../ExperienceDetailPage.jsx'

// F2b-2 (i18n-es-en) task 4.3 RED — the experience detail page reads its
// chrome from the `experiencia` namespace. Specs:
//   * "DB-driven detail page": with EN active the title, description and
//     location fields MUST remain the stored Spanish values;
//   * "Localized text nodes" / "Localized accessibility names": gallery a11y
//     names, dialog copy, section headings and buttons resolve from resources;
//   * "Resource-driven interpolation": selection hints and capacity sentences
//     come from templates ({{n}}, {{count}}), never JSX concatenation;
//   * "User and DB content passthrough": API `error.message` and estado render
//     verbatim; the "how to arrive" button label (new frontend literal from
//     the 2fc6c26 refactor) is extracted too.
// F4-owned surfaces (DIAS/MESES_CORTOS/nombreMeses/nombreDias arrays, Intl
// price/date formats) are asserted as UNCHANGED. react-leaflet is mocked
// (F2b-1 precedent). The ES block is the extraction approval test.

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
  useMap: () => null,
}))

const fixtures = vi.hoisted(() => {
  const base = {
    id: 42,
    titulo: 'Ruta del café en Apan',
    categoria: 'Café',
    descripcion: 'Senderismo entre fincas cafetaleras.',
    municipio: 'Apan',
    departamento: 'Chalatenango',
    precio: 25,
    capacidad: 8,
    habitaciones: 2,
    camas: 3,
    banos: 2,
    horaEntrada: '14:00',
    horaSalida: '11:00',
    anfitrion: 'Carlos Mendoza',
    anfitrionId: 7,
    anfitrionFoto: '',
    anfitrionDescripcion: '',
    anfitrionVerificado: true,
    direccion: 'Final calle principal, Apan',
    estado: 'activo',
    imagenes: ['https://cdn.test/uno.jpg', 'https://cdn.test/dos.jpg'],
    amenidades: ['WiFi'],
    horarios: [],
    fechasDisponibles: [],
    proximaFecha: null,
    popular: false,
    latitud: '13.7',
    longitud: '-89.2',
  }
  return {
    hospedaje: {
      ...base,
      tipo: 'hospedaje',
      horarios: [{ diaSemana: null, fecha: '2099-01-05', horaInicio: '10:00', horaFin: '12:00' }],
    },
    experiencia: { ...base, tipo: 'experiencia' },
  }
})

vi.mock('../../../services/experiencias.js', () => ({
  getExperienciaById: vi.fn(async () => fixtures.hospedaje),
}))

vi.mock('../../../services/reservas.js', () => ({
  getDisponibilidad: vi.fn(async () => []),
  crearReserva: vi.fn(async () => ({ id: 1 })),
}))

import { getExperienciaById } from '../../../services/experiencias.js'

function renderDetail() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/experiencias/42']}>
        <Routes>
          <Route path="/experiencias/:id" element={<ExperienceDetailPage />} />
          <Route path="/reservas" element={<div>pantalla de reservas</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

async function openLoaded(experiencia = fixtures.hospedaje) {
  getExperienciaById.mockResolvedValue(experiencia)
  renderDetail()
  return screen.findByRole('heading', { level: 2 })
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

describe('EN active: detail chrome comes from the experiencia namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders stay info labels, units and CTAs in English with DB fields verbatim', async () => {
    await openLoaded()

    // DB passthrough (spec "DB-driven detail page").
    expect(screen.getByRole('heading', { level: 2, name: 'Ruta del café en Apan' })).toBeInTheDocument()
    expect(screen.getByText('Apan, Chalatenango')).toBeInTheDocument()
    expect(screen.getByText('Café')).toBeInTheDocument()
    expect(screen.getByText('activo')).toBeInTheDocument()
    expect(screen.getByText('Final calle principal, Apan')).toBeInTheDocument()

    // Frontend-owned chrome in English.
    expect(screen.getByText('Capacity')).toBeInTheDocument()
    expect(screen.getByText('8 guests')).toBeInTheDocument()
    expect(screen.getByText('Rooms')).toBeInTheDocument()
    expect(screen.getByText('Beds')).toBeInTheDocument()
    expect(screen.getByText('Baths')).toBeInTheDocument()
    expect(screen.getByText('Check-in')).toBeInTheDocument()
    expect(screen.getByText('Check-out')).toBeInTheDocument()
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('/night')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How to get there' })).toBeInTheDocument()

    // The new scroll-section labels, dated chip (F4-owned formatting) now
    // renders through Intl en-US: '5 ene' -> 'Jan 5'.
    expect(screen.getByText('Available dates')).toBeInTheDocument()
    expect(
      screen.getByText('Only the dates marked by the host can be booked.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Jan 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Location' })).toBeInTheDocument()
    expect(screen.queryByText(/experiencia:/)).toBeNull()
  })

  it('renders the experience branch, description and host card in English', async () => {
    await openLoaded(fixtures.experiencia)

    expect(screen.getByText('Spots')).toBeInTheDocument()
    expect(screen.getByText('8 people')).toBeInTheDocument()
    expect(screen.getByText('/person')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Description' })).toBeInTheDocument()
    // Stored description stays verbatim Spanish under English heading.
    expect(screen.getByText('Senderismo entre fincas cafetaleras.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Amenities' })).toBeInTheDocument()
    expect(screen.getByText('WiFi')).toBeInTheDocument()

    // Host card: frontend labels + DB name verbatim (also shown in the info
    // grid dd) + fallback description.
    expect(screen.getByRole('heading', { level: 3, name: 'Your host' })).toBeInTheDocument()
    expect(screen.getAllByText('Carlos Mendoza')).toHaveLength(2)
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText("This host hasn't added a description yet.")).toBeInTheDocument()
    expect(screen.getByText('View full profile →')).toBeInTheDocument()
    // F5 (task 6.4): the host card link emits the English-form alias URL under EN.
    expect(screen.getByRole('link', { name: /Carlos Mendoza/ })).toHaveAttribute('href', '/hosts/7')
  })

  it('localizes gallery accessibility names and the lightbox', async () => {
    await openLoaded()

    // The strip has prev/next buttons; the first thumbnail targets image 1.
    expect(screen.getAllByRole('button', { name: 'Previous image' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Next image' }).length).toBeGreaterThan(0)
    expect(screen.getByTitle('View full image')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View image 2 enlarged' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View image 2 enlarged' }))
    const lightbox = await screen.findByRole('dialog', {
      name: 'Expanded image of Ruta del café en Apan',
    })
    expect(within(lightbox).getByRole('button', { name: 'Close image' })).toBeInTheDocument()
    fireEvent.click(within(lightbox).getByRole('button', { name: 'Close image' }))
    expect(screen.queryByRole('dialog', { name: /^Expanded image/ })).toBeNull()

    cleanup()
    getExperienciaById.mockResolvedValueOnce({ ...fixtures.experiencia, imagenes: [] })
    renderDetail()
    expect(await screen.findByText('No images')).toBeInTheDocument()
  })

  it('localizes the booking calendar dialog steps', async () => {
    await openLoaded(fixtures.experiencia)

    fireEvent.click(screen.getByRole('button', { name: 'Book now' }))
    const dialog = await screen.findByRole('dialog', { name: 'Choose booking date' })
    expect(within(dialog).getByText('For how many people?')).toBeInTheDocument()
    expect(
      within(dialog).getByText('How many people will join the experience?'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Maximum capacity: 8 people')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Fewer people' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'More people' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await within(dialog).findByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { level: 3 })).toHaveTextContent('Choose your date')
    expect(within(dialog).getByText('Pick a day')).toBeInTheDocument()
  })

  it('runs the full booking flow to the localized page toast', async () => {
    await openLoaded(fixtures.experiencia)

    fireEvent.click(screen.getByRole('button', { name: 'Book now' }))
    const calendar = await screen.findByRole('dialog', { name: 'Choose booking date' })
    fireEvent.click(within(calendar).getByRole('button', { name: 'Continue' }))
    const day = await within(calendar).findByRole('button', { name: '15' })
    fireEvent.click(day)
    fireEvent.click(within(calendar).getByRole('button', { name: 'Continue' }))

    const form = await screen.findByRole('dialog', { name: 'Booking form' })
    fireEvent.click(within(form).getByRole('button', { name: 'Confirm booking' }))

    // Page-level success toast (frontend-owned copy, not an API mensaje).
    // It appears when the form's own timer hands control back (~1.5s).
    expect(
      await screen.findByText('Booking created successfully. Go to "My bookings" to pay.', undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument()
  })

  it('shows the not-found and API error messages through localized templates', async () => {
    getExperienciaById.mockResolvedValueOnce(null)
    renderDetail()
    expect(await screen.findByText('Experience not found.')).toBeInTheDocument()
    cleanup()

    getExperienciaById.mockRejectedValueOnce(new Error('boom'))
    renderDetail()
    // {{error}} interpolation carries the API message verbatim.
    expect(await screen.findByText('Error: boom')).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish detail byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', async () => {
    await openLoaded()

    expect(screen.getByText('← Volver al catálogo')).toBeInTheDocument()
    expect(screen.getByText('Capacidad')).toBeInTheDocument()
    expect(screen.getByText('8 huéspedes')).toBeInTheDocument()
    expect(screen.getByText('Habitaciones')).toBeInTheDocument()
    expect(screen.getByText('Camas')).toBeInTheDocument()
    expect(screen.getByText('Baños')).toBeInTheDocument()
    expect(screen.getByText('Entrada')).toBeInTheDocument()
    expect(screen.getByText('Salida')).toBeInTheDocument()
    expect(screen.getByText('Anfitrión')).toBeInTheDocument()
    expect(screen.getByText('Dirección')).toBeInTheDocument()
    expect(screen.getByText('Estado')).toBeInTheDocument()
    expect(screen.getByText('/noche')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reservar ahora' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cómo llegar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Descripción' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Amenidades' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Fechas disponibles' })).toBeInTheDocument()
    expect(
      screen.getByText('Solo se pueden reservar las fechas marcadas por el anfitrión.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Ubicación' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Tu anfitrión' })).toBeInTheDocument()
    expect(screen.getByText('Verificado')).toBeInTheDocument()
    expect(screen.getByText('Ver perfil completo →')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Imagen anterior' }).length).toBeGreaterThan(0)
  })

  it('renders the experience branch and calendar steps in Spanish', async () => {
    await openLoaded(fixtures.experiencia)

    expect(screen.getByText('Cupos')).toBeInTheDocument()
    expect(screen.getByText('8 personas')).toBeInTheDocument()
    expect(screen.getByText('/persona')).toBeInTheDocument()
    // DB host name verbatim in the info dd and the host card.
    expect(screen.getAllByText('Carlos Mendoza')).toHaveLength(2)
    // F5 approval: the ES host link stays on the canonical Spanish path.
    expect(screen.getByRole('link', { name: /Carlos Mendoza/ })).toHaveAttribute('href', '/anfitriones/7')
    expect(screen.getByText('Este anfitrión aún no agregó una descripción.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reservar ahora' }))
    const dialog = await screen.findByRole('dialog', { name: 'Elegir fecha de reserva' })
    expect(within(dialog).getByText('¿Para cuántas personas?')).toBeInTheDocument()
    expect(within(dialog).getByText('Capacidad máxima: 8 personas')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeInTheDocument()
  })
})
