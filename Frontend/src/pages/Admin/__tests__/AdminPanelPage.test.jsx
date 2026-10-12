import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import AdminPanelPage from '../AdminPanelPage.jsx'

// F2b-1 (i18n-es-en): the admin panel reads its chrome from the `admin`
// namespace (lean focused RED for the task 4.2 GREEN extraction — strict-tdd
// forbids touching AdminPanelPage.jsx before a failing test exists).
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Enum, unit, and badge labels localized": the boolean verificado chip IS
//     frontend-mapped (Verificado/Pendiente labels), so EN renders English
//     labels while the stored boolean stays untouched;
//   * "User and DB content passthrough": publication `estado` has no frontend
//     mapping today, so its chips stay raw DB values even under EN (F2b audit
//     decision); host names/emails/location names are DB data, verbatim;
//   * shared copy (¿Eliminar?/Sí, eliminar/Cancelar/Descartar mensaje)
//     resolves through `common` per the dedup list.
// The ES block is the extraction approval test: Spanish stays byte-comparable.

const fixtures = vi.hoisted(() => ({
  usuario: { id: 1, rol: 'admin', nombre: 'Root' },
  anfitriones: [
    {
      id: 5, nombre: 'Ana Pérez', email: 'ana@correo.com', telefono: '+503 7000 1234',
      verificado: true, fotoPerfil: 'https://cdn.local/ana.jpg', publicaciones: [{ id: 3 }],
      municipio: { nombre: 'Suchitoto', departamento: { nombre: 'San Salvador' } },
    },
    {
      id: 6, nombre: 'Luis Gómez', email: 'luis@correo.com', telefono: null,
      verificado: false, fotoPerfil: null, publicaciones: [], municipio: null,
    },
  ],
  publicaciones: [
    {
      id: 3, titulo: 'Ruta del café en Apan', categoria: { nombre: 'Café' },
      precioPorNoche: 25, estado: 'Publicada', anfitrion: { nombre: 'Ana Pérez' },
    },
    {
      id: 4, titulo: 'Laguna de las Estrellas', categoria: null,
      precioPorNoche: 30, estado: 'Borrador', anfitrion: null,
    },
  ],
}))

vi.mock('../../../services/anfitriones.js', () => ({
  esAdmin: vi.fn((rol) => rol === 'admin' || rol === 'administrador'),
}))

vi.mock('../../../services/api.js', () => ({
  api: {
    get: vi.fn(async (url) => (url === '/Anfitrione' ? fixtures.anfitriones : fixtures.publicaciones)),
    put: vi.fn(async () => ({ ok: true })),
    delete: vi.fn(async () => ({ ok: true })),
  },
}))

// Create/edit modal is F2b-2 surface (react-leaflet through LocationPicker).
vi.mock('../../../components/CrearPublicacionModal.jsx', () => ({
  default: () => null,
}))

function renderAdmin() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPanelPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  fixtures.usuario = { id: 1, rol: 'admin', nombre: 'Root' }
  sessionStorage.setItem('iguana_usuario', JSON.stringify(fixtures.usuario))
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
  sessionStorage.removeItem('iguana_usuario')
})

describe('EN active: admin panel chrome comes from the admin namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('maps the verificado boolean to EN chips without touching the stored value, DB fields verbatim', async () => {
    renderAdmin()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Administration panel')
    expect(screen.getByText('General platform management.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hosts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.getByText('Contact')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()

    // Boolean -> display label mapping exists here (unlike publication estado).
    expect(screen.getAllByText('Verified')).toHaveLength(2) // table header + chip
    expect(screen.getByText('Pending')).toBeInTheDocument()
    // Display-only: the stored booleans are untouched.
    expect(fixtures.anfitriones[0].verificado).toBe(true)
    expect(fixtures.anfitriones[1].verificado).toBe(false)

    // Toggle controls resolve through the admin namespace.
    expect(screen.getByRole('button', { name: 'Unverify' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument()
    expect(screen.getAllByTitle('Delete profile')).toHaveLength(2)

    // DB data verbatim: names, emails and stored location strings.
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('ana@correo.com')).toBeInTheDocument()
    expect(screen.getByText('Suchitoto, San Salvador')).toBeInTheDocument()

    expect(screen.queryByText(/admin:/)).toBeNull()
  })

  it('keeps publication estado chips as raw DB passthrough and reuses shared confirm copy', async () => {
    renderAdmin()
    await screen.findByRole('heading', { level: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Listings' }))
    expect(await screen.findByText('Listing')).toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
    // No frontend mapping exists for publication estado: verbatim under EN.
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()

    fireEvent.click(screen.getAllByTitle('Delete listing')[0])
    expect(await screen.findByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('Yes, delete')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Delete?')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reviews' }))
    const reviews = screen.getByRole('main')
    expect(within(reviews).getByText('Review management')).toBeInTheDocument()
    expect(within(reviews).getByText('This section will be available soon.')).toBeInTheDocument()
  })

  it('renders the non-admin gate in EN', async () => {
    fixtures.usuario = { id: 2, rol: 'usuario', nombre: 'Pepe' }
    sessionStorage.setItem('iguana_usuario', JSON.stringify(fixtures.usuario))
    renderAdmin()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Restricted access')
    expect(
      screen.getByText('This section is exclusive to system administrators.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/admin:/)).toBeNull()
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', async () => {
    renderAdmin()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Panel de administración')
    expect(screen.getByText('Gestión general de la plataforma.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anfitriones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicaciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reseñas' })).toBeInTheDocument()
    expect(screen.getByText('Anfitrión')).toBeInTheDocument()
    expect(screen.getByText('Contacto')).toBeInTheDocument()
    expect(screen.getByText('Ubicación')).toBeInTheDocument()
    // Chips and toggles keep the exact legacy Spanish labels.
    expect(screen.getAllByText('Verificado')).toHaveLength(2)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No verificar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeInTheDocument()
    expect(screen.getAllByTitle('Verificar perfil')).toHaveLength(1)
    expect(screen.getAllByTitle('Quitar verificación')).toHaveLength(1)
    expect(screen.getAllByTitle('Eliminar perfil')).toHaveLength(2)

    // Publicaciones tab: raw estado chip + table headers in canonical Spanish.
    fireEvent.click(screen.getByRole('button', { name: 'Publicaciones' }))
    expect(screen.getByText('Precio')).toBeInTheDocument()
    expect(screen.getByText('Publicada')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reseñas' }))
    expect(screen.getByText('Gestión de reseñas')).toBeInTheDocument()
    expect(screen.getByText('Esta sección estará disponible próximamente.')).toBeInTheDocument()
  })

  it('renders the original non-admin gate literals', async () => {
    fixtures.usuario = { id: 2, rol: 'usuario', nombre: 'Pepe' }
    sessionStorage.setItem('iguana_usuario', JSON.stringify(fixtures.usuario))
    renderAdmin()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Acceso restringido')
    expect(
      screen.getByText('Esta sección es exclusiva para administradores del sistema.'),
    ).toBeInTheDocument()
  })
})
