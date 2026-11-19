import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import PasswordResetPage from '../PasswordResetPage.jsx'
import AuthPage from '../AuthPage.jsx'

// Password recovery reuses the emailed 6-digit code machinery: step 1 asks the
// server for a code (POST solicitar-reset-password) and step 2 redeems it for
// a new password (POST restablecer-password). The server answers with the same
// generic message whether or not the account exists, so this suite asserts the
// passthrough copy verbatim, never a "user not found" branch. The EN block is
// the localization approval: chrome comes from the `auth` namespace and raw
// keys never surface.

const fixtures = vi.hoisted(() => ({
  // Per-endpoint overrides: `{ reject }` throws that object (the API error
  // shape `err.mensaje`), `{ resolve }` replaces the default payload.
  routes: {},
}))

vi.mock('../../../services/api.js', () => ({
  api: {
    post: vi.fn(async (path) => {
      const route = fixtures.routes[path]
      if (route?.reject) throw route.reject
      if (route?.resolve !== undefined) return route.resolve
      return { ok: true }
    }),
  },
}))

function renderResetPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/restablecer-password']}>
        <PasswordResetPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

// Renders the reset screen with a /login outlet so the post-success redirect
// (setTimeout → navigate) can be observed instead of assumed.
function renderResetPageWithLoginOutlet() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/restablecer-password']}>
        <Routes>
          <Route path="/restablecer-password" element={<PasswordResetPage />} />
          <Route path="/login" element={<div>login-screen</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function renderLoginPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

// Drive step 1 with a valid address so the suite lands on the code+password
// step without repeating the email round-trip in every test.
async function goToCodeStep(email = 'ana@correo.com') {
  fireEvent.change(screen.getByLabelText('Correo electrónico *'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  await screen.findByRole('heading', { level: 1, name: 'Ingresá el código' })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  fixtures.routes = {}
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('ES: the recovery flow moves from asking the code to redeeming it', () => {
  it('requests a code with the typed email and switches to the code step', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = {
      resolve: { mensaje: 'Si existe una cuenta con ese correo, te enviamos un código para restablecer tu contraseña.' },
    }
    renderResetPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Restablecer contraseña' })).toBeInTheDocument()
    await goToCodeStep()

    expect(await screen.findByText(
      'Si existe una cuenta con ese correo, te enviamos un código para restablecer tu contraseña.',
    )).toBeInTheDocument()
  })

  it('rejects a malformed email client-side without calling the API', async () => {
    renderResetPage()

    fireEvent.change(screen.getByLabelText('Correo electrónico *'), { target: { value: 'no-es-correo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))

    expect((await screen.findAllByText('Ingresa un correo válido con @ y un dominio (ej: nombre@dominio.com).'))).toHaveLength(2)
    // The form stays on step 1: the code screen never mounts.
    expect(screen.queryByRole('heading', { name: 'Ingresá el código' })).toBeNull()
  })

  it('validates the 6-digit code before touching the API', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { resolve: { mensaje: 'ok' } }
    renderResetPage()
    await goToCodeStep()

    fireEvent.change(screen.getByLabelText('Código de verificación *'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))

    expect(await screen.findAllByText('El código debe tener 6 dígitos.')).toHaveLength(2)
  })

  it('validates that both passwords are present and match', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { resolve: { mensaje: 'ok' } }
    renderResetPage()
    await goToCodeStep()

    fireEvent.change(screen.getByLabelText('Código de verificación *'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))
    expect(await screen.findAllByText('La contraseña es obligatoria.')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Nueva contraseña *'), { target: { value: 'secreta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))
    expect(await screen.findAllByText('Confirma tu contraseña.')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Confirmar contraseña *'), { target: { value: 'otra-clave' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))
    expect(await screen.findAllByText('Las contraseñas no coinciden.')).toHaveLength(2)
  })

  it('redeems the code with the new password and redirects to the login screen', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { resolve: { mensaje: 'ok' } }
    fixtures.routes['/Auth/restablecer-password'] = {
      resolve: { mensaje: 'Tu contraseña fue restablecida con éxito. Ya podés iniciar sesión.' },
    }
    renderResetPageWithLoginOutlet()
    await goToCodeStep()

    fireEvent.change(screen.getByLabelText('Código de verificación *'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña *'), { target: { value: 'secreta1' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña *'), { target: { value: 'secreta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))

    expect(await screen.findByText('Tu contraseña fue restablecida con éxito. Ya podés iniciar sesión.')).toBeInTheDocument()

    // The success toast is the server passthrough; then the SPA lands on login
    // (no session is opened by the reset itself).
    await waitFor(
      () => expect(screen.getByText('login-screen')).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('surfaces a failed server mensaje verbatim and keeps the form', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { resolve: { mensaje: 'ok' } }
    fixtures.routes['/Auth/restablecer-password'] = {
      reject: { mensaje: 'El código ingresado no es válido o ya expiró.' },
    }
    renderResetPage()
    await goToCodeStep()

    fireEvent.change(screen.getByLabelText('Código de verificación *'), { target: { value: '000000' } })
    fireEvent.change(screen.getByLabelText('Nueva contraseña *'), { target: { value: 'secreta1' } })
    fireEvent.change(screen.getByLabelText('Confirmar contraseña *'), { target: { value: 'secreta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña' }))

    // 'mensaje never stripped': inline error + toast, both untouched.
    expect(await screen.findAllByText('El código ingresado no es válido o ya expiró.')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Ingresá el código' })).toBeInTheDocument()
  })

  it('re-requests a code from the code step through the resend endpoint', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { resolve: { mensaje: 'ok' } }
    fixtures.routes['/Auth/reenviar-reset-password'] = {
      resolve: { mensaje: 'Te enviamos un código nuevo.' },
    }
    renderResetPage()
    await goToCodeStep()

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))

    expect(await screen.findByText('Te enviamos un código nuevo.')).toBeInTheDocument()
  })

  it('falls back to the localized error when the failure carries no mensaje', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { reject: {} }
    renderResetPage()

    fireEvent.change(screen.getByLabelText('Correo electrónico *'), { target: { value: 'ana@correo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }))

    expect(await screen.findAllByText('No se pudo enviar el código. Intentalo de nuevo.')).toHaveLength(2)
  })
})

describe('EN active: the recovery chrome comes from the auth namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders headings, labels and buttons from the EN resources', async () => {
    renderResetPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/auth:/)).toBeNull()
  })

  it('switches to the EN code step after requesting the code', async () => {
    fixtures.routes['/Auth/solicitar-reset-password'] = { resolve: { mensaje: 'ok' } }
    renderResetPage()

    fireEvent.change(screen.getByLabelText('Email address *'), { target: { value: 'ana@correo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Enter the code' })).toBeInTheDocument()
    expect(screen.getByLabelText('Verification code *')).toBeInTheDocument()
    expect(screen.getByLabelText('New password *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeInTheDocument()
    expect(screen.queryByText(/auth:/)).toBeNull()
  })
})

describe('the login screen links into the recovery flow', () => {
  it('offers the forgot-password link pointing at the reset screen (ES)', async () => {
    renderLoginPage()

    const link = await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' })
    expect(link).toHaveAttribute('href', '/restablecer-password')
  })

  it('emits the English alias under EN', async () => {
    await i18n.changeLanguage('en')
    renderLoginPage()

    const link = await screen.findByRole('link', { name: 'Forgot your password?' })
    expect(link).toHaveAttribute('href', '/reset-password')
  })
})
