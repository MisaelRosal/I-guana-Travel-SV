import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import MiPerfilPage from '../MiPerfilPage.jsx'

// F2a (i18n-es-en): the host profile page reads its chrome from the `perfil`
// namespace (task 3.3 RED companion to the planned AuthPage suite — strict-tdd
// forbids touching MiPerfilPage.jsx before a failing test exists).
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Localized text nodes": EN renders labels, badges, buttons, placeholders
//     and select prompt options from the English resources;
//   * "User and DB content passthrough": the host name, stored email/phone and
//     municipio/departamento names are DB data and MUST render verbatim;
//   * frontend-owned validation copy IS extracted.
// The ES block is the extraction approval test: Spanish stays byte-comparable.

const fixtures = vi.hoisted(() => ({
  perfil: {
    id: 1,
    nombre: 'Ana Pérez',
    email: 'ana@correo.com',
    telefono: '+503 7000 1234',
    descripcion: 'Guía de café en Apan.',
    verificado: true,
    publicacionesCount: 3,
    fotoPerfil: 'https://cdn.local/ana.jpg',
    municipioId: 5,
    municipio: { id: 5, nombre: 'Suchitoto', departamentoId: 1, departamento: { id: 1, nombre: 'San Salvador' } },
  },
  // When true, GET mi-perfil rejects (the "no host profile" state).
  perfilFalla: false,
}))

vi.mock('../../../services/anfitriones.js', () => ({
  getMiPerfil: vi.fn(async () => {
    if (fixtures.perfilFalla) throw new Error('Not Found')
    return fixtures.perfil
  }),
  actualizarMiPerfilAnfitrion: vi.fn(async (datos) => ({
    ...fixtures.perfil,
    ...datos,
    municipio: fixtures.perfil.municipio,
  })),
  getMunicipios: vi.fn(async () => [{ id: 5, nombre: 'Suchitoto', departamentoId: 1 }]),
  obtenerSesion: vi.fn(() => ({ id: 1, rol: 'anfitrion', nombre: 'Ana', email: 'ana@correo.com' })),
}))

vi.mock('../../../services/api.js', () => ({
  api: { get: vi.fn(async () => [{ id: 1, nombre: 'San Salvador' }]) },
}))

function renderMiPerfil() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/mi-perfil']}>
        <MiPerfilPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  fixtures.perfilFalla = false
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: profile chrome comes from the perfil namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders read-mode labels, badge and actions in EN while DB data stays verbatim', async () => {
    renderMiPerfil()

    // The h1 is the stored host name — passthrough, never a resource lookup.
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ana Pérez')
    expect(screen.getByRole('img', { name: 'Profile photo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back to home' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText('Contact email')).toBeInTheDocument()
    expect(screen.getByText('ana@correo.com')).toBeInTheDocument()
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.getByText('+503 7000 1234')).toBeInTheDocument()
    // JD-INFO-5: the EN overlay calls the DB entity `listing(s)` everywhere
    // (admin/panel/catalog); the perfil block had drifted to "Publications".
    expect(screen.getByText('Listings')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()
    expect(screen.getByText('Suchitoto, San Salvador')).toBeInTheDocument()
    expect(screen.getByText('Short description')).toBeInTheDocument()
    expect(screen.getByText('Guía de café en Apan.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit my profile' })).toBeInTheDocument()

    expect(screen.queryByText(/perfil:/)).toBeNull()
  })

  it('renders edit-mode form chrome in EN and runs localized validation and save', async () => {
    renderMiPerfil()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit my profile' }))
    expect(screen.getByLabelText('Contact email *')).toHaveValue('ana@correo.com')
    expect(screen.getByPlaceholderText('email@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('Municipality *')).toBeInTheDocument()
    // Prompt options are frontend copy; DB option values stay stored Spanish.
    expect(screen.getByRole('option', { name: 'Select a department' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Select a municipality' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Suchitoto' })).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Tell us who you are and what experience you offer...'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()

    // Timer-deterministic save/toast flow: Toast auto-dismisses with real
    // timers (50ms in / 3500ms out / 300ms unmount), and under full-suite
    // contention the wall clock could pass that window before findByRole ever
    // polled the status node — the flake this isolation removes. Fake timers
    // freeze the window; `act` flushes the mocked service promise chain
    // (microtasks only), so every assertion below is synchronous against a
    // guaranteed-mounted toast. Same expectations, identical behavior.
    vi.useFakeTimers()
    try {
      // Frontend-owned validation copy resolves through the perfil namespace.
      fireEvent.change(screen.getByLabelText('Contact email *'), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(screen.getByText('Enter a contact email.')).toBeInTheDocument()

      // Successful save shows the localized toast; stored location names persist.
      fireEvent.change(screen.getByLabelText('Contact email *'), { target: { value: 'nueva@correo.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await act(async () => {})
      expect(screen.getByRole('status')).toHaveTextContent('Profile updated successfully.')
      expect(screen.getByText('nueva@correo.com')).toBeInTheDocument()
      expect(screen.getByText('Suchitoto, San Salvador')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the missing-profile state in EN', async () => {
    fixtures.perfilFalla = true
    renderMiPerfil()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('My profile')
    expect(screen.getByText("We couldn't find your host profile.")).toBeInTheDocument()
    // F5 (task 6.4): the CTA emits the English-form signup URL under EN.
    expect(screen.getByRole('link', { name: 'Become a host' })).toHaveAttribute('href', '/become-a-host')
    expect(screen.queryByText(/perfil:/)).toBeNull()
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original profile literals after moving them into resources', async () => {
    renderMiPerfil()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ana Pérez')
    expect(screen.getByRole('img', { name: 'Foto de perfil' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Volver al inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Verificado')).toBeInTheDocument()
    expect(screen.getByText('Correo de contacto')).toBeInTheDocument()
    expect(screen.getByText('Teléfono')).toBeInTheDocument()
    expect(screen.getByText('Publicaciones')).toBeInTheDocument()
    expect(screen.getByText('Ubicación')).toBeInTheDocument()
    expect(screen.getByText('Breve descripción')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar mi perfil' })).toBeInTheDocument()
  })

  it('renders the original missing-profile literals', async () => {
    fixtures.perfilFalla = true
    renderMiPerfil()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Mi perfil')
    expect(screen.getByText('No encontramos tu perfil de anfitrión.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conviértete en anfitrión' })).toHaveAttribute('href', '/hacerse-anfitrion')
  })
})
