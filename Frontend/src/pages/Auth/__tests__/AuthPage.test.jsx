import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../i18n/config.js'
import AuthPage from '../AuthPage.jsx'
import RegisterPage from '../RegisterPage.jsx'

// F2a (i18n-es-en): the auth pages read their chrome from the `auth` namespace.
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Localized text nodes": with EN active, headings, labels, placeholders
//     and buttons MUST come from the English resources;
//   * "Overlay subset": a key missing from the EN overlay falls back to the
//     canonical Spanish, never renders a raw key and never crashes. The
//     `login.noAccount` key is deliberately ABSENT from en/auth.json (same
//     partial-rollout precedent as `header:langToggle.group` from F0);
//   * "User and DB content passthrough": backend `mensaje` values (e.g.
//     "No autorizado") render verbatim in any locale. The frontend-owned
//     required-credentials message (AuthPage.jsx:20) IS extracted; the API
//     copy is NOT touched (no api.js/Toast changes in this wave).
// The ES block is the extraction approval test: Spanish is canonical, so the
// UI MUST stay byte-comparable after the literals move into resources.

const fixtures = vi.hoisted(() => ({
  // When set, api.post rejects with this object (simulating the API error
  // shape `err.mensaje` consumed by both pages).
  reject: null,
  // JD-INFO-6 (disclosed W-5): per-endpoint overrides so the register flow
  // can arm the verification step and then fail ONLY the verify/resend
  // calls. `{ reject }` throws that object from api.post for the path,
  // `{ resolve }` replaces the default `{ ok: true }` payload.
  routes: {},
  // Server answer when the email-verification policy is on: the account is
  // created but dormant, and RegisterPage switches to paso === 'verificar'.
  verifyRequired: {
    verificacionRequerida: true,
    email: 'ana@correo.com',
    // Backend passthrough copy (Spanish), rendered verbatim in any locale.
    mensaje: 'Te enviamos un código de verificación.',
  },
}))

vi.mock('../../../services/api.js', () => ({
  api: {
    post: vi.fn(async (path) => {
      if (fixtures.reject) throw fixtures.reject
      const route = fixtures.routes[path]
      if (route?.reject) throw route.reject
      if (route?.resolve !== undefined) return route.resolve
      return { ok: true }
    }),
  },
}))

vi.mock('../../../services/session.js', () => ({
  restaurarSesion: vi.fn(async () => {}),
}))

function renderAuthPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function renderRegisterPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/registro']}>
        <RegisterPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

// JD-INFO-6: drive the register form through client validation and submit it,
// so the mocked POST can arm the verification step. Labels are asserted
// against the same localized chrome the flow must render.
const registerLabels = {
  en: ['First name *', 'Last name *', 'Phone number *', 'Email address *', 'Password *', 'Confirm password *'],
  es: ['Nombre *', 'Apellido *', 'Número de teléfono *', 'Correo electrónico *', 'Contraseña *', 'Confirmar contraseña *'],
}
const registerValues = ['Ana', 'Pérez', '+503 7000 1234', 'ana@correo.com', 'secreta1', 'secreta1']

async function submitRegisterAndWaitVerifyStep(lang) {
  const submitName = lang === 'en' ? 'Create account' : 'Registrarse'
  registerLabels[lang].forEach((label, i) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value: registerValues[i] } })
  })
  fireEvent.click(screen.getByRole('button', { name: submitName }))
  // Paso 'verificar' swaps the h1: the register form is gone.
  await screen.findByRole('heading', {
    level: 1,
    name: lang === 'en' ? 'Verify your email' : 'Verificá tu correo',
  })
}

beforeEach(() => {
  localStorage.clear()
  fixtures.reject = null
  fixtures.routes = {}
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: auth chrome comes from the auth namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the login form headings, labels and buttons from EN resources', async () => {
    renderAuthPage()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Sign in')
    expect(screen.getByText('Welcome back to I Guana Travel SV')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    // F5 (task 6.5): the register cross-link emits the English-form URL under EN.
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register')

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/auth:/)).toBeNull()
  })

  it('falls back to canonical Spanish for the key missing from the EN overlay, without crashing', async () => {
    renderAuthPage()

    // `login.noAccount` exists only in es/auth.json — the overlay-subset
    // scenario resolves it through fallbackLng: 'es'.
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Sign in')
    expect(screen.getByText('No tienes cuenta,')).toBeInTheDocument()
    // No crash, no raw key anywhere on the page.
    expect(screen.queryByText(/auth:/)).toBeNull()
  })

  it('validates required credentials in EN, then keeps the backend mensaje verbatim', async () => {
    renderAuthPage()

    // Frontend-owned validation copy (the AuthPage.jsx:20 literal) is localized.
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(screen.getAllByText('Email and password are required.')).toHaveLength(2)

    // Backend passthrough (spec "Backend error under English"): the API
    // `mensaje` is rendered untouched, next to the English chrome.
    fixtures.reject = { mensaje: 'No autorizado' }
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ana@correo.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secreta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    // The passthrough string appears twice by design: inline error + toast.
    expect(await screen.findAllByText('No autorizado')).toHaveLength(2)
  })

  it('completes login with the localized success toast', async () => {
    renderAuthPage()

    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'ana@correo.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secreta1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('status')).toHaveTextContent("You're signed in!")
  })

  it('renders register headings, labels, placeholders and validation from EN resources', async () => {
    renderRegisterPage()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Register')
    expect(screen.getByText('Create your I Guana Travel SV account')).toBeInTheDocument()
    expect(screen.getByLabelText('First name *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument()
    expect(screen.getByLabelText('Last name *')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone number *')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address *')).toBeInTheDocument()
    expect(screen.getByLabelText('Password *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Minimum 6 characters')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Repeat the password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    // JD-INFO-3: the EN footer question ends with "?" only — the overlay had
    // shipped a malformed "?,", rendered verbatim next to the Log in link.
    expect(screen.getByText('Already have an account?')).toBeInTheDocument()
    expect(screen.queryByText(/auth:/)).toBeNull()

    // First validation rule (nombre required) fires in EN: inline field
    // error + summary paragraph + toast all render the same string.
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getAllByText('First name is required.')).toHaveLength(3)
  })

  it('transitions a verification-required register to the localized verify chrome (JD-INFO-6)', async () => {
    fixtures.routes['/Auth/register'] = { resolve: fixtures.verifyRequired }
    renderRegisterPage()

    await submitRegisterAndWaitVerifyStep('en')

    // register.verify.* chrome: code input, submit/resend/back buttons.
    expect(screen.getByLabelText('Verification code *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verify email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to sign-up' })).toBeInTheDocument()

    // Trans interpolation: the server-echoed email lands inside the <strong>
    // slot mapped to the styled span, framed by the EN intro copy.
    const strongSlot = screen.getByText('ana@correo.com')
    expect(strongSlot.tagName).toBe('SPAN')
    expect(strongSlot).toHaveClass('break-all')
    expect(strongSlot.parentElement.tagName).toBe('P')
    expect(strongSlot.parentElement.textContent).toContain('We sent a 6-digit code to')
    expect(strongSlot.parentElement.textContent).toContain('. Enter it to complete your sign-up.')

    // The register form chrome is gone (paso switched, not merely hidden).
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull()

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/auth:/)).toBeNull()
  })

  it('completes email verification with the localized success toast', async () => {
    fixtures.routes['/Auth/register'] = { resolve: fixtures.verifyRequired }
    renderRegisterPage()

    await submitRegisterAndWaitVerifyStep('en')
    fireEvent.change(screen.getByLabelText('Verification code *'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))

    expect(await screen.findByText('Email verified! Your account is active.')).toBeInTheDocument()
  })

  it('renders a failed verify server mensaje verbatim next to the EN chrome', async () => {
    fixtures.routes['/Auth/register'] = { resolve: fixtures.verifyRequired }
    fixtures.routes['/Auth/verificar-email'] = {
      reject: { mensaje: 'El código ingresado no es válido.' },
    }
    renderRegisterPage()

    await submitRegisterAndWaitVerifyStep('en')
    fireEvent.change(screen.getByLabelText('Verification code *'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))

    // 'mensaje never stripped' contract: inline error + toast, untouched.
    expect(await screen.findAllByText('El código ingresado no es válido.')).toHaveLength(2)
  })

  it('falls back to the localized verify error when the failure carries no mensaje', async () => {
    fixtures.routes['/Auth/register'] = { resolve: fixtures.verifyRequired }
    fixtures.routes['/Auth/verificar-email'] = { reject: {} }
    renderRegisterPage()

    await submitRegisterAndWaitVerifyStep('en')
    fireEvent.change(screen.getByLabelText('Verification code *'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))

    expect(await screen.findAllByText("Couldn't verify the code. Try again.")).toHaveLength(2)
  })

  it('surfaces the localized error when resending the code fails', async () => {
    fixtures.routes['/Auth/register'] = { resolve: fixtures.verifyRequired }
    fixtures.routes['/Auth/reenviar-verificacion'] = { reject: {} }
    renderRegisterPage()

    await submitRegisterAndWaitVerifyStep('en')
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))

    expect(await screen.findAllByText("Couldn't resend the code.")).toHaveLength(2)
  })
})

describe('ES active: extraction keeps the canonical Spanish UI byte-comparable', () => {
  it('renders the original login literals after moving them into resources', async () => {
    renderAuthPage()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Iniciar sesión')
    expect(screen.getByText('Bienvenido de nuevo a I Guana Travel SV')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('tu@correo.com')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByText('No tienes cuenta,')).toBeInTheDocument()
    // F5 approval: ES keeps the canonical Spanish cross-links byte-identical.
    expect(screen.getByRole('link', { name: 'Regístrate' })).toHaveAttribute('href', '/registro')

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(screen.getAllByText('Correo y contraseña son obligatorios.')).toHaveLength(2)
  })

  it('renders the original register literals and validation after extraction', async () => {
    renderRegisterPage()

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Regístrate')
    expect(screen.getByText('Crea tu cuenta en I Guana Travel SV')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Tu nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Apellido *')).toBeInTheDocument()
    expect(screen.getByLabelText('Número de teléfono *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('+503 7000 0000')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico *')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mínimo 6 caracteres')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Repite la contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrarse' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Registrarse' }))
    // Field error + summary + toast render the same canonical literal.
    expect(screen.getAllByText('El nombre es obligatorio.')).toHaveLength(3)
  })

  it('transitions a verification-required register to the canonical ES verify chrome (JD-INFO-6)', async () => {
    fixtures.routes['/Auth/register'] = { resolve: fixtures.verifyRequired }
    renderRegisterPage()

    await submitRegisterAndWaitVerifyStep('es')

    // register.verify.* chrome in the canonical Spanish copy.
    expect(screen.getByLabelText('Código de verificación *')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Verificar correo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar código' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Volver a completar el registro' })).toBeInTheDocument()

    // Trans interpolation: same <strong> slot, canonical ES frame.
    const strongSlot = screen.getByText('ana@correo.com')
    expect(strongSlot.tagName).toBe('SPAN')
    expect(strongSlot).toHaveClass('break-all')
    expect(strongSlot.parentElement.textContent).toContain('Te enviamos un código de 6 dígitos a')
    expect(strongSlot.parentElement.textContent).toContain('. Ingresalo para completar tu registro.')

    // No raw keys surface in the canonical locale either.
    expect(screen.queryByText(/auth:/)).toBeNull()
  })
})
