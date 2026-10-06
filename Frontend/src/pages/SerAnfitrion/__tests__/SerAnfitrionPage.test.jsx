import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import SerAnfitrionPage from '../SerAnfitrionPage.jsx'

// F2a (i18n-es-en): the "become a host" page reads its chrome from the
// `publicacion` namespace (task 3.3 RED companion — strict-tdd forbids
// touching SerAnfitrionPage.jsx before a failing test exists).
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Localized text nodes": EN renders headings, hints, labels, prompt
//     options and buttons from the English resources;
//   * "User and DB content passthrough": the prefilled account email comes
//     from the session and renders verbatim; departamento/municipio option
//     labels are DB data and stay stored Spanish;
//   * frontend-owned validation copy IS extracted.
// The ES block is the extraction approval test: Spanish stays byte-comparable.

const fixtures = vi.hoisted(() => ({
  usuario: { id: 1, rol: 'viajero', nombre: 'Ana', apellido: 'Pérez', email: 'ana@correo.com', telefono: '' },
}))

vi.mock('../../../services/anfitriones.js', () => ({
  getMunicipios: vi.fn(async () => [{ id: 5, nombre: 'Suchitoto', departamentoId: 1 }]),
  registrarAnfitrion: vi.fn(async (datos) => ({ id: 9, ...datos })),
  obtenerSesion: vi.fn(() => fixtures.usuario),
  guardarSesion: vi.fn(),
}))

vi.mock('../../../services/api.js', () => ({
  api: { get: vi.fn(async () => [{ id: 1, nombre: 'San Salvador' }]) },
  readCsrfToken: vi.fn(() => 'csrf-token-test'),
}))

function renderSerAnfitrion() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/hacerse-anfitrion']}>
        <SerAnfitrionPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  fixtures.usuario = { id: 1, rol: 'viajero', nombre: 'Ana', apellido: 'Pérez', email: 'ana@correo.com', telefono: '' }
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: host-signup chrome comes from the publicacion namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders headings, hints, labels and buttons in EN with session data verbatim', async () => {
    renderSerAnfitrion()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Become a host')
    expect(screen.getByText('Create your host profile. We need a photo of you.')).toBeInTheDocument()
    expect(screen.getByText('Profile photo *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument()
    expect(screen.getByText('JPG or PNG. It will be visible to your guests.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address *')).toHaveValue('ana@correo.com')
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Contact phone')).toBeInTheDocument()
    expect(screen.getByLabelText('Short description *')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Tell us who you are and what experience you offer...'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Select a department' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Select a municipality' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create host profile' })).toBeInTheDocument()

    expect(screen.queryByText(/publicacion:/)).toBeNull()
  })

  it('shows the localized frontend validation copy on submit without a photo', async () => {
    renderSerAnfitrion()

    fireEvent.click(await screen.findByRole('button', { name: 'Create host profile' }))
    // Inline error + toast render the same extracted string.
    expect(screen.getAllByText('Profile photo is required.')).toHaveLength(2)
  })

  it('renders the logged-out gate in EN', async () => {
    fixtures.usuario = null
    renderSerAnfitrion()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Become a host')
    expect(screen.getByText('To offer your experiences you need to sign in.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original host-signup literals after moving them into resources', async () => {
    renderSerAnfitrion()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Conviértete en anfitrión')
    expect(screen.getByText('Crea tu perfil de anfitrión. Necesitamos una foto de tu persona.')).toBeInTheDocument()
    expect(screen.getByText('Foto de perfil *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elegir foto' })).toBeInTheDocument()
    expect(screen.getByText('JPG o PNG. Será visible para tus huéspedes.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico *')).toHaveValue('ana@correo.com')
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Teléfono de contacto')).toBeInTheDocument()
    expect(screen.getByLabelText('Breve descripción *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Cuéntanos quién eres y qué experiencia ofreces...')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Seleccioná un departamento' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Seleccioná un municipio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear perfil de anfitrión' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Crear perfil de anfitrión' }))
    expect(screen.getAllByText('La foto de perfil es obligatoria.')).toHaveLength(2)
  })
})
