import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from '../App.jsx'

// A7: the wildcard catch-all must render the not-found copy for unknown paths
// while known routes keep their own screens. BrowserRouter reads the jsdom
// location at mount, so each case rewires history before rendering.
// The header/footer chrome mounts the real layout, so the API client and the
// session-restore call are stubbed to keep the test network-free.
vi.mock('../services/api.js', () => ({
  readCsrfToken: () => 'csrf',
  api: {
    get: vi.fn(async () => []),
    put: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
}))

vi.mock('../services/session.js', () => ({
  leerSesionCache: () => null,
  guardarSesionCache: vi.fn(),
  restaurarSesion: (async () => null),
  cerrarSesion: (async () => null),
}))

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('A7: wildcard catch-all route', () => {
  it('renders the not-found screen (with layout chrome) for an unknown path', async () => {
    window.history.replaceState(null, '', '/esta-pagina-no-existe')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'No encontramos la página' }))
      .toBeInTheDocument()
    expect(screen.getByText('La dirección que buscás no existe o fue movida a otra sección.'))
      .toBeInTheDocument()
    // It sits under RootLayout: header/footer stay around the fallback page.
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toHaveAttribute('href', '/')
  })

  it('does not show the not-found copy on a known route', async () => {
    window.history.replaceState(null, '', '/')
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: /Descubre las experiencias/ }))
      .toBeInTheDocument()
    expect(screen.queryByText('No encontramos la página')).toBeNull()
  })
})
