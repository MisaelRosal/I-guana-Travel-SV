import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import PerfilAnfitrionPage from '../PerfilAnfitrionPage.jsx'

// F5 (task 6.5 + 4.5 gate closure) — the public host profile was the one page
// no earlier wave owned: its frontend-owned Spanish literals are extracted
// into the `perfil` namespace (page-owned `perfil.host.*` block, reusing the
// byte-identical shared keys perfil.back/loading/avatarAlt/badge.*) and its
// links become locale-aware through localePath. Specs:
//   * localized-ui-content "Localized text nodes" / "Overlay subset": EN
//     chrome from resources, DB values (name, city, description, titles)
//     verbatim, raw keys never surface;
//   * localized-routes "In-app navigation uses locale-aware paths": the card
//     link emits /experiences/:id under EN and the canonical /experiencias/:id
//     under ES.
// The ES block is the extraction approval test: canonical Spanish stays
// byte-comparable.

const fixtures = vi.hoisted(() => ({
  anfitrion: {
    id: 7,
    nombre: 'Ana',
    apellido: 'Pérez',
    email: 'ana@correo.com',
    telefono: '+503 7000 1234',
    descripcion: 'Guía de café en Apan.',
    verificado: true,
    fotoPerfil: 'https://cdn.test/ana.jpg',
    municipio: { nombre: 'Suchitoto', departamento: { nombre: 'San Salvador' } },
  },
  publicaciones: [
    {
      id: 3, anfitrionId: 7, tipo: 'hospedaje', titulo: 'Casa en El Tunco',
      precio: 120, imagenes: ['https://cdn.test/a.jpg'], municipio: 'La Libertad', departamento: 'La Libertad',
    },
    {
      id: 4, anfitrionId: 7, tipo: 'experiencia', titulo: 'Ruta del café',
      precio: 25, imagenes: [], municipio: 'Apan', departamento: 'Chalatenango',
    },
  ],
  falla: false,
  sinPerfil: false,
}))

vi.mock('../../../services/anfitriones.js', () => ({
  getAnfitrionPorId: vi.fn(async () => {
    if (fixtures.falla) throw new Error('boom')
    return fixtures.sinPerfil ? null : fixtures.anfitrion
  }),
}))

vi.mock('../../../services/experiencias.js', () => ({
  getExperiencias: vi.fn(async () => fixtures.publicaciones),
}))

function renderHostProfile() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/anfitriones/7']}>
        <Routes>
          <Route path="/anfitriones/:id" element={<PerfilAnfitrionPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  fixtures.falla = false
  fixtures.sinPerfil = false
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: host-profile chrome comes from the perfil namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders labels, badge and listings heading in EN with DB data verbatim', async () => {
    renderHostProfile()

    // Loading state is localized from the first paint.
    expect(screen.getByText('Loading profile…')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ana')
    expect(screen.getByRole('link', { name: '← Back to home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('img', { name: 'Profile photo' })).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'About' })).toBeInTheDocument()
    // DB description passthrough under the English heading.
    expect(screen.getByText('Guía de café en Apan.')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('ana@correo.com')).toBeInTheDocument()
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()
    // The DB location renders twice by design: under the name and in the row.
    expect(screen.getAllByText('Suchitoto, San Salvador')).toHaveLength(2)
    // JD-INFO-5: EN overlay normalizes the entity to `listing(s)`; the ES
    // canonical "Publicaciones de {{name}}" twin below stays untouched.
    expect(screen.getByRole('heading', { level: 2, name: 'Listings by Ana' })).toBeInTheDocument()

    // Raw keys never surface (overlay subset guarantee).
    expect(screen.queryByText(/perfil:/)).toBeNull()
  })

  it('renders publication cards with EN units and the English-form detail URL', async () => {
    renderHostProfile()

    const stayLink = await screen.findByRole('link', { name: /Casa en El Tunco/ })
    expect(stayLink).toHaveAttribute('href', '/experiences/3')
    expect(screen.getByText('/night')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ruta del café/ })).toHaveAttribute('href', '/experiences/4')
    expect(screen.getByText('/person')).toBeInTheDocument()
    // Missing image falls back to the localized frontend-owned label.
    expect(screen.getByText('No image')).toBeInTheDocument()
    // DB titles/municipality render verbatim Spanish under English chrome.
    expect(screen.getByText('Apan, Chalatenango')).toBeInTheDocument()
  })

  it('shows the localized not-found and error states', async () => {
    fixtures.sinPerfil = true
    renderHostProfile()
    expect(await screen.findByText('Host profile not found.')).toBeInTheDocument()
    cleanup()

    fixtures.falla = true
    renderHostProfile()
    // {{error}} interpolation carries the API message verbatim.
    expect(await screen.findByText('Error: boom')).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original host-profile literals after moving them into resources', async () => {
    renderHostProfile()

    expect(screen.getByText('Cargando perfil…')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ana')
    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('img', { name: 'Foto de perfil' })).toBeInTheDocument()
    expect(screen.getByText('Verificado')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Sobre mí' })).toBeInTheDocument()
    expect(screen.getByText('Guía de café en Apan.')).toBeInTheDocument()
    expect(screen.getByText('Correo')).toBeInTheDocument()
    expect(screen.getByText('Teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ubicación')).toBeInTheDocument()
    // The DB location renders twice by design: under the name and in the row.
    expect(screen.getAllByText('Suchitoto, San Salvador')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 2, name: 'Publicaciones de Ana' })).toBeInTheDocument()

    const stayLink = screen.getByRole('link', { name: /Casa en El Tunco/ })
    expect(stayLink).toHaveAttribute('href', '/experiencias/3')
    expect(screen.getByText('/noche')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ruta del café/ })).toHaveAttribute('href', '/experiencias/4')
    expect(screen.getByText('/persona')).toBeInTheDocument()
    expect(screen.getByText('Sin imagen')).toBeInTheDocument()
  })

  it('renders the original not-found and error literals', async () => {
    fixtures.sinPerfil = true
    renderHostProfile()
    expect(await screen.findByText('No se encontró el anfitrión.')).toBeInTheDocument()
    cleanup()

    fixtures.falla = true
    renderHostProfile()
    expect(await screen.findByText('Error: boom')).toBeInTheDocument()
  })
})
