import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import CatalogPage from '../CatalogPage.jsx'

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
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByText('Filter results')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Listing type' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Experiences' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stays' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()

    // Empty list (fixture) proves the empty state is localized too. The list
    // area waits for the full-screen loading splash, which now holds a minimum
    // visible time (CARGA_MINIMA_MS = 2000, pruebas logo feature), so poll past it.
    expect(await screen.findByText('No listings found', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(
      screen.getByText('Create the first listing from the operator panel.'),
    ).toBeInTheDocument()

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/catalog:/)).toBeNull()
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

    // The main empty state resolves after CARGA_MINIMA_MS, by which time the
    // upcoming fetch has settled: a zero-length list renders no section at
    // all (CatalogPage.jsx guards `proximasExperiencias.length > 0`), so no
    // count label can ever claim a plural for nothing.
    expect(await screen.findByText('No listings found', {}, { timeout: 3000 })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Upcoming experiences')
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
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByText('Filtrar resultados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
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
