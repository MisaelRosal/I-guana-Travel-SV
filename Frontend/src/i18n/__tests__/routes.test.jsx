import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from '../../App.jsx'
import i18n from '../config.js'
import { ROUTE_PAIRS, localePath } from '../routes.jsx'

// F5 (i18n-es-en) task 6.1 RED — router matrix per specs/localized-routes:
//   * every Spanish route renders its screen under BOTH locales (the backward
//     compatibility MUST: no existing URL may 404 or change screens);
//   * the English aliases from AD-1 resolve to the IDENTICAL screens, with
//     parameter parity (/hosts/42 renders exactly what /anfitriones/42 does);
//   * unmatched paths keep today's behavior — no catch-all was added, so a
//     path no route pair owns renders neither the layout nor any screen;
//   * in-app Link targets emit the locale-form URL (English chrome hrefs for
//     EN users, canonical Spanish for ES users — approval block).
// The screens are replaced by named markers so this suite proves ROUTE
// RESOLUTION (path -> screen component), which is exactly what routes.jsx
// owns. Each screen's own behavior stays covered by its colocated suite.

// One shared screen-marker factory (hoisted so every vi.mock below can call
// it): parameterized screens read :id from the router to prove the alias
// carries the actual URL params.
const mockScreen = vi.hoisted(() => async (marker, useParamsId) => {
  const reactRouter = await import('react-router-dom')
  const Screen = () => {
    const suffix = useParamsId ? `:${reactRouter.useParams().id}` : ''
    return <span>{`screen:${marker}${suffix}`}</span>
  }
  return { default: Screen }
})

vi.mock('../../pages/Catalog/CatalogPage.jsx', () => mockScreen('catalog', false))
vi.mock('../../pages/ExperienceDetail/ExperienceDetailPage.jsx', () => mockScreen('experience-detail', true))
vi.mock('../../pages/Auth/AuthPage.jsx', () => mockScreen('login', false))
vi.mock('../../pages/Auth/RegisterPage.jsx', () => mockScreen('register', false))
vi.mock('../../pages/Reservations/ReservationsPage.jsx', () => mockScreen('reservations', false))
vi.mock('../../pages/OperatorPanel/OperatorPanelPage.jsx', () => mockScreen('panel', false))
vi.mock('../../pages/SerAnfitrion/SerAnfitrionPage.jsx', () => mockScreen('become-host', false))
vi.mock('../../pages/Admin/AdminPanelPage.jsx', () => mockScreen('admin', false))
vi.mock('../../pages/MiPerfil/MiPerfilPage.jsx', () => mockScreen('my-profile', false))
vi.mock('../../pages/PerfilAnfitrion/PerfilAnfitrionPage.jsx', () => mockScreen('host-profile', true))

// The real Header revalidates the cached session on mount; answer 401 so the
// signed-out chrome (Sign in / nav / footer) renders deterministically with
// no network. (Same stub strategy as the F0 runtime suite.)
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  globalThis.fetch = vi.fn(async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({}),
  }))
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  window.history.pushState({}, '', '/')
  localStorage.clear()
})

async function renderAt(path) {
  window.history.pushState({}, '', path)
  await act(async () => {
    render(<App />)
  })
}

const ES_PATHS = [
  ['/', 'catalog'],
  ['/experiencias/42', 'experience-detail:42'],
  ['/login', 'login'],
  ['/registro', 'register'],
  ['/reservas', 'reservations'],
  ['/panel', 'panel'],
  ['/hacerse-anfitrion', 'become-host'],
  ['/admin', 'admin'],
  ['/mi-perfil', 'my-profile'],
  ['/anfitriones/42', 'host-profile:42'],
]

const EN_ALIASES = [
  ['/experiences/42', 'experience-detail:42'],
  ['/register', 'register'],
  ['/bookings', 'reservations'],
  ['/become-a-host', 'become-host'],
  ['/my-profile', 'my-profile'],
  ['/hosts/42', 'host-profile:42'],
]

describe('Spanish routes render their screens under ES (approval: unchanged today)', () => {
  for (const [path, marker] of ES_PATHS) {
    it(`${path} renders ${marker}`, async () => {
      await renderAt(path)
      expect(screen.getByText(`screen:${marker}`)).toBeInTheDocument()
    })
  }
})

describe('Spanish routes keep resolving under EN (compatibility MUST)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  for (const [path, marker] of ES_PATHS) {
    it(`${path} still renders ${marker} with English active`, async () => {
      await renderAt(path)
      expect(screen.getByText(`screen:${marker}`)).toBeInTheDocument()
    })
  }
})

describe('English aliases resolve to the same screens under EN', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  for (const [path, marker] of EN_ALIASES) {
    it(`${path} renders ${marker}`, async () => {
      await renderAt(path)
      expect(screen.getByText(`screen:${marker}`)).toBeInTheDocument()
    })
  }
})

describe('parameter parity between the alias forms', () => {
  it('/hosts/42 and /anfitriones/42 render the identical host screen, and /hosts/7 tracks its own param', async () => {
    await renderAt('/anfitriones/42')
    expect(screen.getByText('screen:host-profile:42')).toBeInTheDocument()
    cleanup()

    await renderAt('/hosts/42')
    expect(screen.getByText('screen:host-profile:42')).toBeInTheDocument()
    cleanup()

    // Triangulation: a different id proves the param flows through the alias.
    await renderAt('/hosts/7')
    expect(screen.getByText('screen:host-profile:7')).toBeInTheDocument()
  })

  it('/experiences/42 renders the identical detail screen as /experiencias/42', async () => {
    await renderAt('/experiencias/42')
    expect(screen.getByText('screen:experience-detail:42')).toBeInTheDocument()
    cleanup()

    await renderAt('/experiences/42')
    expect(screen.getByText('screen:experience-detail:42')).toBeInTheDocument()
  })
})

describe("unmatched paths keep today's no-match behavior (no catch-all added)", () => {
  for (const locale of ['es', 'en']) {
    it(`renders neither layout nor screen for /noexiste under ${locale.toUpperCase()}`, async () => {
      await i18n.changeLanguage(locale)
      await renderAt('/noexiste')

      expect(screen.queryByText(/screen:/)).toBeNull()
      // Today the pathless layout only mounts when a child matches: a blank
      // document IS the existing behavior and MUST be preserved verbatim.
      expect(document.querySelector('header')).toBeNull()
    })
  }
})

describe('ROUTE_PAIRS mirrors the AD-1 table (10 pairs, alias-only)', () => {
  it('exposes exactly the key/es/en forms of the design', () => {
    expect(ROUTE_PAIRS.map(({ key, es, en }) => ({ key, es, en }))).toEqual([
      { key: 'catalog', es: '/', en: '/' },
      { key: 'experienceDetail', es: 'experiencias/:id', en: 'experiences/:id' },
      { key: 'login', es: 'login', en: 'login' },
      { key: 'register', es: 'registro', en: 'register' },
      { key: 'reservations', es: 'reservas', en: 'bookings' },
      { key: 'panel', es: 'panel', en: 'panel' },
      { key: 'becomeHost', es: 'hacerse-anfitrion', en: 'become-a-host' },
      { key: 'admin', es: 'admin', en: 'admin' },
      { key: 'miPerfil', es: 'mi-perfil', en: 'my-profile' },
      { key: 'hostProfile', es: 'anfitriones/:id', en: 'hosts/:id' },
    ])
  })
})

describe('localePath(key, params) emits the active-locale URL', () => {
  it('ES emits the canonical Spanish paths (byte-identical to today)', () => {
    expect(localePath('catalog')).toBe('/')
    expect(localePath('login')).toBe('/login')
    expect(localePath('register')).toBe('/registro')
    expect(localePath('reservations')).toBe('/reservas')
    expect(localePath('panel')).toBe('/panel')
    expect(localePath('becomeHost')).toBe('/hacerse-anfitrion')
    expect(localePath('admin')).toBe('/admin')
    expect(localePath('miPerfil')).toBe('/mi-perfil')
    expect(localePath('experienceDetail', { id: 42 })).toBe('/experiencias/42')
    expect(localePath('hostProfile', { id: '7' })).toBe('/anfitriones/7')
  })

  it('EN emits the English aliases and keeps the invariant forms', async () => {
    await i18n.changeLanguage('en')
    expect(localePath('catalog')).toBe('/')
    expect(localePath('login')).toBe('/login')
    expect(localePath('panel')).toBe('/panel')
    expect(localePath('admin')).toBe('/admin')
    expect(localePath('register')).toBe('/register')
    expect(localePath('reservations')).toBe('/bookings')
    expect(localePath('becomeHost')).toBe('/become-a-host')
    expect(localePath('miPerfil')).toBe('/my-profile')
    expect(localePath('experienceDetail', { id: 42 })).toBe('/experiences/42')
    expect(localePath('hostProfile', { id: '7' })).toBe('/hosts/7')
  })

  it('fails loudly on an unknown route key instead of rendering a broken link', () => {
    expect(() => localePath('noexiste')).toThrow(/localePath/)
  })
})

describe('in-app navigation emits locale-aware paths (Header + Footer chrome)', () => {
  it('under EN the nav and footer links point at English-form URLs', async () => {
    await i18n.changeLanguage('en')
    await renderAt('/')
    expect(screen.getByText('screen:catalog')).toBeInTheDocument()

    // Header desktop nav + footer "Explore" list share the localized labels.
    const bookings = screen.getAllByRole('link', { name: 'My bookings' })
    expect(bookings).toHaveLength(2)
    for (const link of bookings) {
      expect(link).toHaveAttribute('href', '/bookings')
    }

    const home = screen.getAllByRole('link', { name: 'Home' })
    expect(home).toHaveLength(2)
    for (const link of home) {
      expect(link).toHaveAttribute('href', '/')
    }

    // Footer "become a host" CTA appears in the Explore list and the hosts box.
    const hostLinks = screen.getAllByRole('link', { name: 'Become a host' })
    expect(hostLinks).toHaveLength(2)
    for (const link of hostLinks) {
      expect(link).toHaveAttribute('href', '/become-a-host')
    }

    // /login is locale-invariant but must still resolve as today.
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('under ES the same links keep the canonical Spanish URLs (approval)', async () => {
    await renderAt('/')

    const bookings = screen.getAllByRole('link', { name: 'Mis reservas' })
    expect(bookings).toHaveLength(2)
    for (const link of bookings) {
      expect(link).toHaveAttribute('href', '/reservas')
    }

    const inicio = screen.getAllByRole('link', { name: 'Inicio' })
    expect(inicio).toHaveLength(2)
    for (const link of inicio) {
      expect(link).toHaveAttribute('href', '/')
    }

    const hostLinks = screen.getAllByRole('link', { name: 'Conviértete en anfitrión' })
    expect(hostLinks).toHaveLength(2)
    for (const link of hostLinks) {
      expect(link).toHaveAttribute('href', '/hacerse-anfitrion')
    }

    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
  })
})
