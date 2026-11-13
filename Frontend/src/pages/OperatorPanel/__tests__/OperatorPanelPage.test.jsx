import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import { getMiPerfil } from '../../../services/anfitriones.js'
import { api } from '../../../services/api.js'
import OperatorPanelPage from '../OperatorPanelPage.jsx'

// F2b-1 (i18n-es-en): the operator panel reads its chrome from the `panel`
// namespace (lean focused RED for the task 4.2 GREEN extraction — strict-tdd
// forbids touching OperatorPanelPage.jsx before a failing test exists).
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Localized text nodes": EN renders headings, table headers, titles and
//     shared action copy from resources;
//   * "User and DB content passthrough": publication titles, municipio and
//     the raw `estado` DB value render verbatim — F2b audit: this chip has no
//     frontend mapping today, so it MUST stay a passthrough (payload and UI
//     both untouched);
//   * "Overlay subset": EN parity is complete for the keys this page reads
//     (M-5 audit closed the `panel.status.emptyBody` gap; precedent keys
//     `reservas.gate.body`, `login.noAccount` also landed);
//   * plural policy (plan item 1): the always-plural capacity cell gains
//     correct `_one/_other` forms — "1 personas" becomes "1 persona" in ES,
//     a documented AD-3 correction.
// Shared copy (close/cancel/delete confirm) resolves through `common`.

const fixtures = vi.hoisted(() => ({
  usuario: { id: 1, rol: 'anfitrion', nombre: 'Ana' },
  publicaciones: [],
  full: [
    {
      id: 3, titulo: 'Ruta del café en Apan', categoria: { nombre: 'Café' },
      precioPorNoche: 25, capacidadMaxima: 4, imagenesPublicacions: [{ url: 'https://cdn.local/a.jpg' }],
      estado: 'Publicada',
      municipio: { nombre: 'Suchitoto', departamento: { nombre: 'San Salvador' } },
    },
    {
      // capacidadMaxima 1: proves the documented plural correction (the old
      // always-plural JSX literal rendered "1 personas").
      id: 4, titulo: 'Laguna de las Estrellas', categoria: null,
      precioPorNoche: 30, capacidadMaxima: 1, imagenesPublicacions: [],
      estado: 'Borrador',
      municipio: { nombre: 'San Miguel', departamento: { nombre: 'San Miguel' } },
    },
  ],
  empty: [],
}))

vi.mock('../../../services/anfitriones.js', () => ({
  obtenerSesion: vi.fn(() => fixtures.usuario),
  esAdmin: vi.fn((rol) => rol === 'admin' || rol === 'administrador'),
  getMiPerfil: vi.fn(async () => ({ id: 9, nombre: 'Ana Pérez', verificado: true })),
}))

vi.mock('../../../services/api.js', () => ({
  api: {
    get: vi.fn(async (url) => (url.startsWith('/Publicacione/anfitrion/') ? fixtures.publicaciones : [])),
    delete: vi.fn(async () => ({ ok: true })),
  },
}))

// The create/edit modal is F2b-2 surface (and pulls react-leaflet through
// LocationPicker); out of this slice's extracted scope — stub it away.
vi.mock('../../../components/CrearPublicacionModal.jsx', () => ({
  default: () => null,
}))

// The dashboard's /Dashboard/ganancias call is out of this slice's scope: feed
// it a valid empty payload so the A-19 quick actions render deterministically.
vi.mock('../../../services/dashboard.js', () => ({
  getGanancias: vi.fn(async () => ({
    periodo: 'mes', desde: '2026-10-01', hasta: '2026-10-12', moneda: 'USD',
    total: 0, totalReservas: 0, promedio: 0, totalGeneral: 0,
    series: [], porPublicacion: [],
  })),
}))

function renderPanel() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/panel']}>
        <OperatorPanelPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  fixtures.publicaciones = fixtures.full
  // Mutation flows scroll to top; jsdom has no real scrollTo.
  window.scrollTo = vi.fn()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: operator panel chrome comes from the panel namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders headings, table headers and the corrected plural capacity while DB fields stay verbatim', async () => {
    renderPanel()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Operator panel')
    expect(screen.getByText('Host listing management.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create listing/ })).toBeInTheDocument()
    expect(screen.getByText('Listing')).toBeInTheDocument()
    expect(screen.getByText('Category'))
      .toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
    expect(screen.getByText('Capacity')).toBeInTheDocument()
    expect(screen.getByText('Images')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()

    // Interpolated _one/_other capacity unit (corrected plural).
    expect(screen.getByText('4 people')).toBeInTheDocument()
    expect(screen.getByText('1 person')).toBeInTheDocument()

    // Passthrough audit decision: `estado` chips render the raw DB value even
    // under EN — no frontend mapping exists for publications.
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Ruta del café en Apan')).toBeInTheDocument()
    expect(screen.getByText('Suchitoto, San Salvador')).toBeInTheDocument()
    expect(fixtures.publicaciones[0].estado).toBe('Publicada')

    // Shared action titles resolve through the panel namespace.
    expect(screen.getAllByTitle('Edit listing')).toHaveLength(2)
    expect(screen.getAllByTitle('Delete listing')).toHaveLength(2)

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/panel:/)).toBeNull()
  })

  it('runs the delete confirmation with shared EN copy and a dismissable success banner', async () => {
    renderPanel()
    await screen.findByText('Listing')

    fireEvent.click(screen.getAllByTitle('Delete listing')[0])
    expect(await screen.findByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('Yes, delete')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Delete?')).toBeNull()

    // Re-open and confirm: localized banner + common.dismiss control.
    fireEvent.click(screen.getAllByTitle('Delete listing')[0])
    fireEvent.click(await screen.findByText('Yes, delete'))
    const banner = await screen.findByRole('status')
    expect(banner).toHaveTextContent('"Ruta del café en Apan" deleted successfully.')
    fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss message' }))
    // Dismiss is a plain state flip: the banner disappears synchronously.
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders the empty state fully in EN', async () => {
    fixtures.publicaciones = fixtures.empty
    renderPanel()

    expect(await screen.findByText('No listings yet')).toBeInTheDocument()
    // M-5: the last EN gap (`status.emptyBody`) landed, so the body is the
    // English resource now.
    expect(screen.getByText('Use the "Create listing" button to add the first one.')).toBeInTheDocument()
    expect(screen.queryByText(/panel:/)).toBeNull()
  })

  // A-19: the dashboard's quick actions switch tabs without a page reload.
  it('jumps from the dashboard quick actions back to the listings and reviews tabs', async () => {
    renderPanel()
    await screen.findByText('Listing')

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(await screen.findByText('Quick actions')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /View my listings/ }))
    expect(await screen.findByText('Listing')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    fireEvent.click(await screen.findByRole('button', { name: /Manage reviews/ }))
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', async () => {
    renderPanel()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Panel del operador')
    expect(screen.getByText('Gestión de publicaciones del anfitrión.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear publicación/ })).toBeInTheDocument()
    expect(screen.getByText('Publicación')).toBeInTheDocument()
    expect(screen.getByText('Categoría')).toBeInTheDocument()
    expect(screen.getByText('Capacidad')).toBeInTheDocument()
    expect(screen.getByText('Imágenes')).toBeInTheDocument()
    expect(screen.getByText('Estado')).toBeInTheDocument()
    expect(screen.getByText('Acciones')).toBeInTheDocument()
    expect(screen.getByText('4 personas')).toBeInTheDocument()
    // Documented correction: the legacy literal never pluralized "1 personas".
    expect(screen.getByText('1 persona')).toBeInTheDocument()
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getAllByTitle('Editar publicación')).toHaveLength(2)
    expect(screen.getAllByTitle('Eliminar publicación')).toHaveLength(2)
    expect(screen.queryByText(/panel:/)).toBeNull()
  })

  it('blocks listing creation until an admin verifies the host account', async () => {
    getMiPerfil.mockResolvedValueOnce({ id: 9, nombre: 'Ana Pérez', verificado: false })
    renderPanel()

    expect(await screen.findByText('Verificación pendiente')).toBeInTheDocument()
    expect(
      screen.getByText('Un administrador debe verificar tu cuenta de anfitrión antes de que puedas crear publicaciones.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear publicación/ })).toBeDisabled()
  })
})

// M5: load/delete failures surface instead of a silent empty table.
describe('M5: publications load/delete errors surface in the panel', () => {
  afterEach(() => {
    // Restore the module-mock default for the following tests.
    api.get.mockImplementation(async (url) =>
      (url.startsWith('/Publicacione/anfitrion/') ? fixtures.publicaciones : []),
    )
    api.delete.mockImplementation(async () => ({ ok: true }))
  })

  it('shows a retryable error banner when the listings request fails', async () => {
    // Scope the failure to the listings URL: mount also fires reviews/reports
    // requests through the same mocked api client.
    api.get.mockImplementation(async (url) => {
      if (url.startsWith('/Publicacione')) throw new Error('boom')
      return []
    })
    renderPanel()

    expect(await screen.findByText('No se pudieron cargar las publicaciones.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    // A failure must never be reported as "no listings yet".
    expect(screen.queryByText('Aún no hay publicaciones')).toBeNull()
  })

  it('reports a failed delete through the page banner instead of swallowing it', async () => {
    renderPanel()
    await screen.findByText('Publicación')

    api.delete.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(screen.getAllByTitle('Eliminar publicación')[0])
    fireEvent.click(await screen.findByText('Sí, eliminar'))

    expect(await screen.findByRole('status')).toHaveTextContent('No se pudo eliminar la publicación.')
  })
})
