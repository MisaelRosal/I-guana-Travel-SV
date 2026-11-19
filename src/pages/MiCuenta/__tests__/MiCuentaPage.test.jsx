import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import { getIdsFavoritos, quitarPublicacionGuardada } from '../../../services/favoritos.js'
import MiCuentaPage from '../MiCuentaPage.jsx'

// Fase 1 (perfil de usuario normal): the page renders identity data from the
// server session (/Auth/me via restaurarSesion), shows an honest empty rating
// (the schema has no guest reputation) and the saved-listings empty state.
const fixtures = vi.hoisted(() => ({
  sesion: {
    id: 7,
    nombre: 'Ana',
    apellido: 'Pérez',
    telefono: '+503 7000 1234',
    email: 'ana@correo.com',
    rol: 'usuario',
    emailVerificado: true,
    createdAt: '2026-01-05T00:00:00Z',
  },
  // When true, restaurarSesion resolves null (no valid cookie).
  sinSesion: false,
  // Fase 2: what GET /api/Favorito/mios returns (already mapped by the service).
  guardadas: [],
  guardada: {
    id: 10,
    titulo: 'Casa frente al mar en El Tunco',
    tipo: 'hospedaje',
    categoria: 'Playa',
    descripcion: 'Casa con vista al mar a pasos de la playa.',
    municipio: 'San Diego',
    departamento: 'La Libertad',
    precio: 120,
    capacidad: 4,
    habitaciones: 2,
    imagenes: [],
    proximaFecha: null,
    popular: false,
  },
}))

vi.mock('../../../services/session.js', () => ({
  restaurarSesion: vi.fn(async () => (fixtures.sinSesion ? null : fixtures.sesion)),
  // useFavoritos (Fase 2) reads the local cache to decide whether to paint the
  // pressed hearts; it mirrors the real session (Header restores it on mount).
  leerSesionCache: vi.fn(() => (fixtures.sinSesion ? null : fixtures.sesion)),
  guardarSesionCache: vi.fn(),
}))

// Saved-listings API (Fase 2): the page paints exactly what this returns, so the
// suite stays hermetic (no fetch, no CSRF, no backend). The id set mirrors the
// real server contract: /Favorito/ids reports exactly the saved /Favorito/mios rows.
vi.mock('../../../services/favoritos.js', () => ({
  getIdsFavoritos: vi.fn(async () => fixtures.guardadas.map((e) => e.id)),
  getGuardadas: vi.fn(async () => fixtures.guardadas),
  guardarPublicacion: vi.fn(async () => ({ guardado: true })),
  quitarPublicacionGuardada: vi.fn(async () => null),
}))

function renderCuenta() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/mi-cuenta']}>
        <Routes>
          <Route path="/mi-cuenta" element={<MiCuentaPage />} />
          <Route path="/login" element={<span>screen:login</span>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  fixtures.sinSesion = false
  fixtures.guardadas = []
  vi.mocked(getIdsFavoritos).mockClear()
  vi.mocked(quitarPublicacionGuardada).mockClear()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('Mi cuenta (ES)', () => {
  it('renders the user data from the server session', async () => {
    renderCuenta()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ana Pérez')
    expect(screen.getByText('ana@correo.com')).toBeInTheDocument()
    expect(screen.getByText('+503 7000 1234')).toBeInTheDocument()
    // Role label appears in the header badge and in the details list.
    expect(screen.getAllByText('Huésped')).toHaveLength(2)
    expect(screen.getByText('Correo verificado')).toBeInTheDocument()
    expect(screen.getByText('Miembro desde')).toBeInTheDocument()
    expect(screen.getByText('Enero 2026')).toBeInTheDocument()
    expect(screen.queryByText(/cuenta:/)).toBeNull()
  })

  it('shows an empty rating and the empty saved-listings state', async () => {
    renderCuenta()

    expect(await screen.findByText('Calificación')).toBeInTheDocument()
    expect(screen.getByText('Sin calificaciones todavía')).toBeInTheDocument()
    expect(screen.getByText('Publicaciones guardadas')).toBeInTheDocument()
    expect(screen.getByText('Aún no guardaste publicaciones.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explorar experiencias' })).toHaveAttribute('href', '/')
  })

  it('redirects to login when the session cannot be restored', async () => {
    fixtures.sinSesion = true
    renderCuenta()

    expect(await screen.findByText('screen:login')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  // Fase 2: the saved section is no longer a placeholder — it paints what
  // GET /api/Favorito/mios returns, with the same heart button the catalog uses
  // to take a publication out of the saved list.
  it('lists the real saved publications and removes one through the heart', async () => {
    fixtures.guardadas = [fixtures.guardada]
    renderCuenta()

    expect(await screen.findByText('1 publicación guardada')).toBeInTheDocument()
    const explorar = screen.getByRole('button', { name: 'Explorar experiencias' })
    expect(explorar).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Casa frente al mar en El Tunco/ })).toBeNull()

    fireEvent.click(explorar)
    expect(explorar).toHaveAttribute('aria-expanded', 'true')

    const cardLink = screen.getByRole('link', { name: /Casa frente al mar en El Tunco/ })
    expect(cardLink).toHaveAttribute('href', '/experiencias/10')

    // The card is painted as saved (pressed heart), matching the API state.
    const quitar = screen.getByRole('button', { name: 'Quitar publicación de guardados' })
    expect(quitar).toHaveAttribute('aria-pressed', 'true')

    // The hook learns the saved id set from /Favorito/ids before any toggle:
    // waiting for it keeps the click deterministic (unsave, never a re-save).
    await waitFor(() => expect(vi.mocked(getIdsFavoritos)).toHaveBeenCalled())

    fireEvent.click(quitar)

    expect(await screen.findByText('Aún no guardaste publicaciones.')).toBeInTheDocument()
    expect(vi.mocked(quitarPublicacionGuardada)).toHaveBeenCalledWith(10)
    expect(screen.queryByRole('link', { name: /Casa frente al mar en El Tunco/ })).toBeNull()
    expect(screen.queryByText('1 publicación guardada')).toBeNull()
  })
})

describe('Mi cuenta (EN)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the account chrome in EN while user data stays verbatim', async () => {
    renderCuenta()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ana Pérez')
    expect(screen.getByText('ana@correo.com')).toBeInTheDocument()
    expect(screen.getAllByText('Guest')).toHaveLength(2)
    expect(screen.getByText('Email verified')).toBeInTheDocument()
    expect(screen.getByText('Member since')).toBeInTheDocument()
    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('Rating')).toBeInTheDocument()
    expect(screen.getByText('No ratings yet')).toBeInTheDocument()
    expect(screen.getByText('Saved listings')).toBeInTheDocument()
    expect(screen.getByText("You haven't saved any listings yet.")).toBeInTheDocument()
    expect(screen.queryByText(/cuenta:/)).toBeNull()
  })

  // Fase 2 in EN: the saved count is pluralized through i18next and the card
  // link follows the EN detail route.
  it('shows the saved counter and the EN detail link for a saved listing', async () => {
    fixtures.guardadas = [fixtures.guardada]
    renderCuenta()

    expect(await screen.findByText('1 saved publication')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Explore experiences' }))
    expect(screen.getByRole('link', { name: /Casa frente al mar en El Tunco/ }))
      .toHaveAttribute('href', '/experiences/10')
    expect(screen.getByRole('button', { name: 'Remove publication from saved' }))
      .toHaveAttribute('aria-pressed', 'true')
  })
})
