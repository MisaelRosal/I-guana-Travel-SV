import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import imagenHero from '../../../assets/EL-TUNCO.jpg'
import CatalogPage from '../CatalogPage.jsx'
import { getCategorias, getDepartamentos, getExperiencias } from '../../../services/experiencias.js'
import { guardarPublicacion } from '../../../services/favoritos.js'

// F1 (i18n-es-en): pilot content — the catalog page reads its chrome from the
// `catalog` namespace. Specs
// (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Localized text nodes": with EN active, static text and placeholders MUST
//     come from the English resources;
//   * "Resource-driven interpolation": interpolated templates MUST resolve from
//     resources ({{label}}, {{max}}, {{n}}), never from JSX concatenation;
//   * "User and DB content passthrough": stored experience titles, categorias,
//     municipio/departamento and descriptions render verbatim in ANY locale.
// The ES block is the extraction approval test: after the literals move into
// resources the Spanish UI MUST stay byte-comparable (es is canonical).

const fixtures = vi.hoisted(() => ({
  categorias: ['Café'],
  departamentos: [{ id: 1, nombre: 'San Salvador' }],
  // DB-owned fields (services map them verbatim from the API): stored Spanish
  // content that MUST NEVER be translated.
  experiencia: {
    id: 42,
    titulo: 'Ruta del café en Apan',
    tipo: 'experiencia',
    categoria: 'Café',
    descripcion: 'Senderismo entre fincas cafetaleras con anfitriones locales.',
    municipio: 'Suchitoto',
    departamento: 'San Salvador',
    precio: 25,
    capacidad: 8,
    habitaciones: 0,
    imagenes: [],
    proximaFecha: null,
    popular: false,
  },
  // Upcoming list served by getProximasExperiencias. The one-card default is
  // re-armed in beforeEach; tests that need a different card count mutate
  // this BEFORE render (JD-INFO-1 invariant: the section label interpolates
  // the REAL list length, never the fetch cap PROXIMAS_LIMITE).
  proximas: [],
  // Fase 2 (guardar publicación): session cache seen by useFavoritos plus the
  // ids the server reports as saved. Anonymous by default, like a first visit.
  sinSesion: true,
  sesion: { id: 7, nombre: 'Ana', apellido: 'Pérez', rol: 'usuario' },
  favoritosIds: [],
}))

vi.mock('../../../services/experiencias.js', () => ({
  getCategorias: vi.fn(async () => fixtures.categorias),
  getDepartamentos: vi.fn(async () => fixtures.departamentos),
  // Empty main list -> the localized empty-state copy renders.
  getExperiencias: vi.fn(async () => []),
  // N upcoming cards -> DB passthrough surface + localized section header
  // whose plural resolves from the same N through _one/_other.
  getProximasExperiencias: vi.fn(async () => fixtures.proximas),
}))

// Fase 2: the heart reads the session through the same local cache the header
// restores, and the saved-id set through /api/Favorito/ids. Both are mocked
// here so the catalog suite keeps its anonymous-by-default world.
vi.mock('../../../services/session.js', async (importOriginal) => ({
  ...(await importOriginal()),
  leerSesionCache: vi.fn(() => (fixtures.sinSesion ? null : fixtures.sesion)),
}))

vi.mock('../../../services/favoritos.js', () => ({
  getIdsFavoritos: vi.fn(async () => fixtures.favoritosIds),
  getGuardadas: vi.fn(async () => []),
  guardarPublicacion: vi.fn(async () => ({ guardado: true })),
  quitarPublicacionGuardada: vi.fn(async () => null),
}))

function renderCatalog() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  // Default: exactly one upcoming card (label MUST say "one", not the cap 3).
  fixtures.proximas = [fixtures.experiencia]
  fixtures.sinSesion = true
  fixtures.favoritosIds = []
  vi.mocked(guardarPublicacion).mockClear()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: catalog chrome comes from the catalog namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders hero, search, filter and empty-state text from EN resources', async () => {
    renderCatalog()

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Discover the experiences of El Salvador')
    expect(
      screen.getByText(
        'Surf, coffee, volcanoes and charming towns. Explore, book and live the country with local hosts.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search by name or description…')).toBeInTheDocument()
    // The search input has no visible label, so its programmatic name is the label.
    expect(screen.getByRole('searchbox', { name: 'Search listings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByText('Filter results')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Listing type' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Experiences' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stays' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

    // Empty list (fixture) proves the empty state is localized too. The splash
    // now ends as soon as the request resolves (no artificial minimum delay).
    expect(await screen.findByText('No listings found')).toBeInTheDocument()
    expect(
      screen.getByText('Create the first listing from the operator panel.'),
    ).toBeInTheDocument()

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/catalog:/)).toBeNull()
  })

  it('uses the former El Tunco hero image and localized catalog copy', async () => {
    const { container } = renderCatalog()

    expect(await screen.findByRole('heading', { level: 1 }))
      .toHaveTextContent('Discover the experiences of El Salvador')
    expect(screen.getByText(
      'Surf, coffee, volcanoes and charming towns. Explore, book and live the country with local hosts.',
    )).toBeInTheDocument()
    expect(container.querySelector('section img')).toHaveAttribute('src', imagenHero)

    await i18n.changeLanguage('es')
    expect(await screen.findByRole('heading', { level: 1 }))
      .toHaveTextContent('Descubre las experiencias de El Salvador')
    expect(screen.getByText(
      'Surf, café, volcanes y pueblos con encanto. Explora, reserva y vive el país con anfitriones locales.',
    )).toBeInTheDocument()
  })

  it('resolves interpolated filter templates from EN resources', async () => {
    renderCatalog()
    await screen.findByRole('heading', { level: 1 })

    // {{label}} interpolation in the listbox accessible name.
    fireEvent.click(screen.getByText('Category'))
    expect(await screen.findByRole('listbox')).toHaveAccessibleName('Options for Category')

    // Selecting a filter drives the mobile button count template.
    fireEvent.click(screen.getByRole('option', { name: 'Café' }))
    expect(await screen.findByRole('button', { name: 'Filters (1)' })).toBeInTheDocument()

    // {{max}} interpolation in the price options.
    fireEvent.click(document.body)
    fireEvent.click(screen.getByText('Price'))
    expect(await screen.findByRole('option', { name: 'Up to $30' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Up to $80' })).toBeInTheDocument()
  })

  it('renders the upcoming-experiences section with the interpolated EN template', async () => {
    renderCatalog()

    expect(await screen.findByText('Upcoming experiences')).toBeInTheDocument()
    // JD-INFO-1 invariant: the label count equals the rendered card count.
    // One card -> EN _one, never the fetch cap PROXIMAS_LIMITE (3).
    expect(screen.getByText('Ruta del café en Apan')).toBeInTheDocument()
    expect(
      screen.getByText('The experience with availability coming up soon.'),
    ).toBeInTheDocument()
  })

  it('interpolates the EN _other plural with the real upcoming count', async () => {
    // 2-item fixture: the label must follow the list length, not the cap of 3.
    fixtures.proximas = [
      fixtures.experiencia,
      { ...fixtures.experiencia, id: 43, titulo: 'Surf en El Sunzal' },
    ]
    renderCatalog()

    // Two cards render...
    expect(await screen.findByText('Surf en El Sunzal')).toBeInTheDocument()
    expect(screen.getByText('Ruta del café en Apan')).toBeInTheDocument()
    // ...and the _other plural says 2: label count == card count.
    expect(
      screen.getByText('The 2 experiences with availability coming up soon.'),
    ).toBeInTheDocument()
  })

  it('hides the upcoming section entirely when there are no experiences', async () => {
    fixtures.proximas = []
    renderCatalog()

    // The main empty state resolves once the request settles: a zero-length
    // list renders no section at all (CatalogPage.jsx guards
    // `proximasExperiencias.length > 0`), so no count label can ever claim a
    // plural for nothing.
    expect(await screen.findByText('No listings found')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Upcoming experiences' })).toBeNull()
    expect(screen.queryByText(/with availability coming up soon/)).toBeNull()
  })

  it('keeps stored DB experience fields verbatim Spanish while the chrome is English', async () => {
    renderCatalog()

    // Passthrough scenario (localized-ui-content spec): every card field is the
    // stored value, not a resource lookup.
    expect(await screen.findByText('Ruta del café en Apan')).toBeInTheDocument()
    expect(screen.getByText('Senderismo entre fincas cafetaleras con anfitriones locales.')).toBeInTheDocument()
    expect(screen.getByText('Suchitoto, San Salvador')).toBeInTheDocument()
    expect(screen.getByText('Café')).toBeInTheDocument()

    // ...while page chrome around the card is English.
    expect(screen.getByRole('heading', { level: 2, name: 'Upcoming experiences' })).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the same Spanish hero, search and filter chrome', async () => {
    renderCatalog()

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Descubre las experiencias de El Salvador')
    expect(
      screen.getByText(
        'Surf, café, volcanes y pueblos con encanto. Explora, reserva y vive el país con anfitriones locales.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Buscar por nombre o descripción…')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar publicaciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByText('Filtrar resultados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    expect(await screen.findByText('Próximas experiencias')).toBeInTheDocument()
    // JD-INFO-1 (ES): one card -> _one, following the real list length.
    expect(
      await screen.findByText('La experiencia con pronta disponibilidad por fecha.'),
    ).toBeInTheDocument()
  })

  it('keeps Spanish interpolated option labels and DB categories untouched', async () => {
    renderCatalog()
    await screen.findByRole('heading', { level: 1 })

    fireEvent.click(screen.getByText('Categoría'))
    expect(await screen.findByRole('listbox')).toHaveAccessibleName('Opciones de Categoría')
    // DB-driven option value stays exactly as stored (same string in ES by nature,
    // and the EN test proves the service never maps a translated value).
    expect(screen.getByRole('option', { name: 'Café' })).toBeInTheDocument()
  })
})

describe('failure states: a backend failure is not an empty result', () => {
  it('shows a clear error state when the listings request fails', async () => {
    getExperiencias.mockRejectedValueOnce(new Error('boom'))
    renderCatalog()

    expect(await screen.findByText('No se pudieron cargar las publicaciones.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    // A network failure must never be reported as "no listings found".
    expect(screen.queryByText('No se encontraron publicaciones')).toBeNull()
  })

  it('surfaces a filter-options failure without an unhandled rejection', async () => {
    getCategorias.mockRejectedValueOnce(new Error('boom'))
    getDepartamentos.mockRejectedValueOnce(new Error('boom'))
    renderCatalog()

    expect(await screen.findByText('No se pudieron cargar las publicaciones.')).toBeInTheDocument()
  })

  it('renders the result without the former artificial loading delay', async () => {
    // The default findBy timeout is 1000ms; the removed CARGA_MINIMA_MS held the
    // splash for 2000ms, so this passes only once that forced delay is gone.
    renderCatalog()

    expect(await screen.findByText('No se encontraron publicaciones')).toBeInTheDocument()
  })
})

// The filter/search state now lives in the URL: a filtered catalog is a real
// link, survives a refresh and works with Back/Forward. These specs pin that
// contract (deep-link renders the filtered set; the URL is the single source of
// truth and stays clean when empty).
function UrlProbe() {
  const location = useLocation()
  return <output data-testid="url">{location.pathname + location.search}</output>
}

function renderCatalogAt(initialEntries) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={initialEntries}>
        <UrlProbe />
        <CatalogPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('filters live in the URL (deep-linkable catalog)', () => {
  beforeEach(() => {
    // Keep the upcoming section out of the way so only the main list renders.
    fixtures.proximas = []
  })

  afterEach(() => {
    // Restore the module-mock default for the following files/tests.
    getExperiencias.mockImplementation(async () => [])
  })

  it('renders the filtered result set for a catalog URL with filter params', async () => {
    const playas = {
      ...fixtures.experiencia,
      id: 77,
      titulo: 'Surf en El Sunzal',
      categoria: 'Surf',
    }
    // The service owns the real filtering; emulate it to prove the URL drives it.
    getExperiencias.mockImplementation(async ({ categoria }) =>
      categoria === 'Café' ? [fixtures.experiencia] : [fixtures.experiencia, playas],
    )

    renderCatalogAt(['/?categoria=Café'])

    expect(await screen.findByText('Ruta del café en Apan')).toBeInTheDocument()
    // The non-matching listing is filtered out by the value taken from the URL.
    expect(screen.queryByText('Surf en El Sunzal')).toBeNull()
    expect(getExperiencias).toHaveBeenCalledWith(expect.objectContaining({ categoria: 'Café' }))
  })

  it('writes selected filters to the URL and drops them again when cleared', async () => {
    getExperiencias.mockImplementation(async () => [fixtures.experiencia])
    renderCatalogAt(['/'])

    await screen.findByRole('heading', { level: 1 })
    // A plain visit stays on a clean URL (no empty params).
    expect(screen.getByTestId('url').textContent).toBe('/')

    fireEvent.click(screen.getByText('Categoría'))
    fireEvent.click(await screen.findByRole('option', { name: 'Café' }))
    expect(screen.getByTestId('url').textContent).toBe('/?categoria=Caf%C3%A9')

    const clearButton = screen.getByRole('button', { name: 'Limpiar filtros' })
    expect(clearButton.parentElement).toHaveClass('flex', 'w-full', 'justify-center')
    fireEvent.click(clearButton)
    expect(screen.getByTestId('url').textContent).toBe('/')
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })
})

// Fase 2 (guardar publicación): every catalog card carries the heart button,
// wired to the shared useFavoritos hook (optimistic, server-scoped). Anonymous
// visitors get the button too — clicking it routes to login instead of a
// doomed API call; signed-in guests toggle through /api/Favorito/{id} and the
// pressed state flips immediately.
function renderCatalogWithLogin() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/login" element={<span>screen:login</span>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe('save toggle (Fase 2): the heart on every catalog card', () => {
  beforeEach(() => {
    fixtures.proximas = []
    getExperiencias.mockImplementation(async () => [fixtures.experiencia])
  })

  afterEach(() => {
    getExperiencias.mockImplementation(async () => [])
  })

  it('renders one unpressed heart per card, outside the card link', async () => {
    renderCatalog()

    expect(await screen.findByText('Ruta del café en Apan')).toBeInTheDocument()
    const corazones = screen.getAllByRole('button', { name: 'Guardar publicación' })
    expect(corazones).toHaveLength(1)
    expect(corazones[0]).toHaveAttribute('aria-pressed', 'false')
    // A <button> inside the <a> would be invalid HTML and a click that
    // navigates by accident: the heart is a sibling of the link.
    expect(screen.getByRole('link', { name: /Ruta del café en Apan/ })
      .contains(corazones[0])).toBe(false)
  })

  it('paints the pressed heart for the ids the server reports as saved', async () => {
    // Signed-in guest: the hook asks /api/Favorito/ids for the pressed state.
    fixtures.sinSesion = false
    fixtures.favoritosIds = [42]
    renderCatalog()

    expect(await screen.findByText('Ruta del café en Apan')).toBeInTheDocument()
    // The id set resolves from /api/Favorito/ids after the first paint.
    expect(await screen.findByRole('button', { name: 'Quitar publicación de guardados' }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('saves through the API and flips the pressed state for a signed-in guest', async () => {
    fixtures.sinSesion = false
    renderCatalog()

    const corazon = await screen.findByRole('button', { name: 'Guardar publicación' })
    fireEvent.click(corazon)

    expect(guardarPublicacion).toHaveBeenCalledWith(42)
    expect(await screen.findByRole('button', { name: 'Quitar publicación de guardados' }))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('routes an anonymous click to login instead of calling the API', async () => {
    renderCatalogWithLogin()

    const corazon = await screen.findByRole('button', { name: 'Guardar publicación' })
    fireEvent.click(corazon)

    expect(await screen.findByText('screen:login')).toBeInTheDocument()
    expect(guardarPublicacion).not.toHaveBeenCalled()
  })
})
