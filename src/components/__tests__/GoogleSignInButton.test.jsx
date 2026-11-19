import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import GoogleSignInButton from '../GoogleSignInButton.jsx'

// The embedded Google button is hidden unless the backend reports a configured
// client id, in which case it initializes Google Identity Services and mounts
// the official button. Exchanging the credential is delegated to
// services/google.js, whose success/failure is surfaced via onExito/onError.

const mocks = vi.hoisted(() => ({
  getGoogleClientId: vi.fn(),
  iniciarSesionConGoogle: vi.fn(),
}))

vi.mock('../../services/google.js', () => ({
  getGoogleClientId: mocks.getGoogleClientId,
  iniciarSesionConGoogle: mocks.iniciarSesionConGoogle,
}))

const CLIENT_ID = 'client-123.apps.googleusercontent.com'

let initOpts
let renderOpts

function renderBtn(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <GoogleSignInButton {...props} />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  initOpts = null
  renderOpts = null
  mocks.getGoogleClientId.mockReset()
  mocks.iniciarSesionConGoogle.mockReset()
  window.google = {
    accounts: {
      id: {
        initialize: vi.fn((opts) => { initOpts = opts }),
        renderButton: vi.fn((el, opts) => {
          renderOpts = opts
          el.setAttribute('data-rendered', 'true')
        }),
      },
    },
  }
})

afterEach(async () => {
  cleanup()
  delete window.google
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('GoogleSignInButton', () => {
  it('renders nothing when the server has no Google client id', async () => {
    mocks.getGoogleClientId.mockResolvedValue('')

    const { container } = renderBtn()

    await waitFor(() => expect(mocks.getGoogleClientId).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(initOpts).toBeNull()
  })

  it('renders the official button once a client id is available', async () => {
    await i18n.changeLanguage('es')
    mocks.getGoogleClientId.mockResolvedValue(CLIENT_ID)

    renderBtn({ text: 'signin_with' })

    expect(await screen.findByTestId('google-button')).toBeInTheDocument()
    await waitFor(() => expect(window.google.accounts.id.renderButton).toHaveBeenCalled())
    expect(initOpts.client_id).toBe(CLIENT_ID)
    expect(renderOpts.text).toBe('signin_with')
    expect(screen.getByText('o')).toBeInTheDocument()
    expect(screen.queryByText(/auth:/)).toBeNull()
  })

  it('renders the English divider when the locale is EN', async () => {
    await i18n.changeLanguage('en')
    mocks.getGoogleClientId.mockResolvedValue(CLIENT_ID)

    renderBtn()

    expect(await screen.findByText('or')).toBeInTheDocument()
  })

  it('exchanges the credential and signals success', async () => {
    mocks.getGoogleClientId.mockResolvedValue(CLIENT_ID)
    const usuario = { id: 9, email: 'g@google.test' }
    mocks.iniciarSesionConGoogle.mockResolvedValue(usuario)
    const onExito = vi.fn()

    renderBtn({ onExito })

    await waitFor(() => expect(initOpts).not.toBeNull())
    await initOpts.callback({ credential: 'tok' })

    expect(mocks.iniciarSesionConGoogle).toHaveBeenCalledWith('tok')
    await waitFor(() => expect(onExito).toHaveBeenCalledWith(usuario))
  })

  it('forwards exchange failures to onError', async () => {
    mocks.getGoogleClientId.mockResolvedValue(CLIENT_ID)
    const error = new Error('bad token')
    mocks.iniciarSesionConGoogle.mockRejectedValue(error)
    const onError = vi.fn()

    renderBtn({ onError })

    await waitFor(() => expect(initOpts).not.toBeNull())
    await initOpts.callback({ credential: 'tok' })

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error))
  })
})
