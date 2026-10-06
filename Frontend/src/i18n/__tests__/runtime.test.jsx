import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from '../../App.jsx'
import i18n from '../config.js'

// F0 (i18n-es-en): mounted-runtime behavior (specs/i18n-runtime/spec.md).
// Renders the real <App/> (provider + router + Header + catalog) under jsdom:
//   * Header exposes an ES/EN pill with localized aria-labels (header ns);
//   * activating EN re-renders everything without a page reload;
//   * <html lang> follows the active language;
//   * `iguana_locale` is written exactly once per `languageChanged`;
//   * a `storage` event for `iguana_locale` syncs this instance (cross-tab)
//     while foreign keys are ignored and the existing sessionStorage auth
//     listeners (Header.jsx:32 / Footer.jsx:40) keep working.

const KEY = 'iguana_locale'
const USER = { id: 1, nombre: 'Ana', apellido: 'Test', email: 'ana@test.sv', rol: 'viajero' }

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: async () => body,
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // The catalog + Header session revalidation hit /api; answer with empty
  // lists and an authenticated user so no test depends on the network.
  globalThis.fetch = vi.fn(async (url) => {
    if (String(url).includes('/Auth/me')) return jsonResponse(USER)
    return jsonResponse([])
  })
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
  sessionStorage.clear()
})

describe('ES/EN toggle pill in the Header (desktop)', () => {
  it('shows both languages with localized aria-labels and switches to EN without a reload', async () => {
    render(<App />)

    // ES active: aria-labels come from the Spanish (canonical) header resource.
    const enButton = screen.getByRole('button', { name: 'Cambiar a inglés' })
    expect(screen.getByRole('button', { name: 'Cambiar a español' })).toBeInTheDocument()

    fireEvent.click(enButton)

    // Same document, no reload: localized chrome re-renders in English.
    await waitFor(() => {
      expect(i18n.language).toBe('en')
      expect(screen.getByRole('button', { name: 'Switch to Spanish' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Switch to English' })).toHaveAttribute('aria-pressed', 'true')
    })

    // <html lang> tracks the active language.
    expect(document.documentElement).toHaveAttribute('lang', 'en')

    // Preference persisted to localStorage under the iguana_* convention.
    expect(localStorage.getItem(KEY)).toBe('en')

    // The toggle group label lives in the header ns and is EN-absent:
    // Spanish fallback, never a raw key, while the rest of the page is intact.
    expect(screen.getByRole('group', { name: 'Selecciona el idioma de la interfaz' })).toBeInTheDocument()

    // F1 landed the catalog pilot content: page chrome now localizes through
    // resources too, so under EN the hero renders the English catalog resource.
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Discover the experiences of')
  })

  it('localizes the header nav and footer chrome from resources under EN (F1 pilot)', async () => {
    // Logged-out chrome: /Auth/me answers 401 so the Sign in control is stable.
    globalThis.fetch = vi.fn(async (url) =>
      String(url).includes('/Auth/me') ? jsonResponse({}, 401) : jsonResponse([]),
    )
    await i18n.changeLanguage('en')
    render(<App />)

    // Spec scenario "Localized accessibility names": the header nav's
    // accessible names are the English strings from the header resource.
    const mainNav = await screen.findByRole('navigation', { name: 'Main navigation' })
    expect(within(mainNav).getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(within(mainNav).getByRole('link', { name: 'My bookings' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()

    // Footer chrome comes from the footer resource (EN overlay).
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('Explore')).toBeInTheDocument()
    expect(within(footer).getByText('Follow us')).toBeInTheDocument()
    expect(within(footer).getByText(/All rights reserved\./)).toBeInTheDocument()
    expect(within(footer).getAllByRole('link', { name: 'Become a host' })).toHaveLength(2)
  })

  it('writes iguana_locale exactly once per languageChanged (StrictMode-safe single listener)', async () => {
    // StrictMode double-mounts effects: a per-component persistence listener
    // would write twice here. Config registers it once at module scope.
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Cambiar a inglés' }))
      await waitFor(() => expect(localStorage.getItem(KEY)).toBe('en'))
      const localeWrites = spy.mock.calls.filter(([key]) => key === KEY)
      expect(localeWrites).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('reloads keep the stored choice: EN is restored on mount', async () => {
    localStorage.setItem(KEY, 'en')
    await i18n.changeLanguage('en')

    render(<App />)

    expect(await screen.findByRole('button', { name: 'Switch to English' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })
})

describe('cross-tab synchronization via storage events', () => {
  it('adopts the language broadcast by another tab for iguana_locale', async () => {
    render(<App />)

    // `storage` only fires in the OTHER tabs; the test simulates tab B receiving it.
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'en' }))

    await waitFor(() => {
      expect(i18n.language).toBe('en')
      expect(document.documentElement).toHaveAttribute('lang', 'en')
      expect(screen.getByRole('button', { name: 'Switch to English' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('ignores storage events for foreign keys', async () => {
    render(<App />)

    window.dispatchEvent(new StorageEvent('storage', { key: 'iguana_usuario', newValue: 'en' }))
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: 'en' }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(i18n.language).toBe('es')
    expect(document.documentElement).toHaveAttribute('lang', 'es')
  })

  it('keeps the existing sessionStorage auth listeners working through a locale change', async () => {
    // Pre-seed the session cache so the auth chrome renders before the async
    // /Auth/me revalidation resolves.
    sessionStorage.setItem('iguana_usuario', JSON.stringify(USER))
    render(<App />)

    expect(await screen.findByText('Ana Test')).toBeInTheDocument()

    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'en' }))
    await waitFor(() => expect(i18n.language).toBe('en'))

    // Header.jsx:32 / Footer.jsx:40 listen to the same `storage` event to
    // re-read the auth cache: the user name must survive the locale switch.
    expect(screen.getByText('Ana Test')).toBeInTheDocument()
    // The pill and the auth control coexist in the new locale.
    expect(screen.getByRole('button', { name: 'Switch to Spanish' })).toBeInTheDocument()
  })
})

describe('ES/EN toggle pill in the Header (mobile)', () => {
  it('renders the same pill inside the mobile menu', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))

    // Desktop nav and mobile nav each expose the control: exactly two EN buttons.
    const enButtons = await screen.findAllByRole('button', { name: 'Cambiar a inglés' })
    expect(enButtons).toHaveLength(2)

    fireEvent.click(enButtons[1])
    await waitFor(() => expect(i18n.language).toBe('en'))
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })
})
