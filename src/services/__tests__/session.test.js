import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cerrarSesion,
  guardarSesionCache,
  leerSesionCache,
  restaurarSesion,
} from '../session.js'

// W3a `/me` rehydration gate, unit-tested against a stubbed fetch (no server).
// The rules under test:
//   * restaurarSesion() asks the SERVER (GET /api/auth/me) who the user is —
//     with credentials included, because the auth cookie is HttpOnly;
//   * the response is cached in sessionStorage purely as a render convenience;
//   * a 401 must wipe the cache so the UI never renders a stale session.

const SESSION_KEY = 'iguana_usuario'
const USER = { id: 7, nombre: 'Test', email: 't@sess.test', rol: 'host' }

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: async () => body,
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('restaurarSesion', () => {
  it('rehydrates from GET /api/auth/me with credentials included', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(USER))
    globalThis.fetch = fetchMock

    const user = await restaurarSesion()

    expect(user).toMatchObject({ id: 7, rol: 'host' })
    // Only request issued: the authenticated read against the API base path.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/Auth/me')
    expect(init.credentials).toBe('include')
  })

  it('caches the fresh user in sessionStorage and signals auth-change', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(USER))
    const events = []
    const listener = (e) => events.push(e.type)
    window.addEventListener('auth-change', listener)
    try {
      await restaurarSesion()
    } finally {
      window.removeEventListener('auth-change', listener)
    }

    expect(leerSesionCache()).toMatchObject({ id: 7 })
    expect(events).toEqual(['auth-change'])
  })

  it('a 401 clears the stale cache and returns null', async () => {
    // A previous session is sitting in the cache.
    guardarSesionCache(USER)
    expect(leerSesionCache()).not.toBeNull()

    // Real 401: the server sends no usable JSON body. api.js turns that into
    // a thrown Error, which restaurarSesion must treat as "no session".
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => {
        throw new Error('empty body')
      },
    }))

    const user = await restaurarSesion()

    expect(user).toBeNull()
    // Stale cache dropped: the UI must not render as logged-in.
    expect(leerSesionCache()).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('treats a non-401 failure (network error) as no session too', async () => {
    guardarSesionCache(USER)
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(restaurarSesion()).resolves.toBeNull()
    expect(leerSesionCache()).toBeNull()
  })
})

describe('cerrarSesion', () => {
  it('posts logout as a mutation and drops the local cache', async () => {
    guardarSesionCache(USER)
    const fetchMock = vi.fn(async () => jsonResponse({}, 204))
    globalThis.fetch = fetchMock

    await cerrarSesion()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/Auth/logout')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(leerSesionCache()).toBeNull()
  })

  it('clears the cache even when the server call fails', async () => {
    guardarSesionCache(USER)
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('offline')
    })

    await cerrarSesion()

    expect(leerSesionCache()).toBeNull()
  })
})

describe('leerSesionCache', () => {
  it('returns null for corrupt JSON instead of throwing', () => {
    sessionStorage.setItem(SESSION_KEY, '{not json')
    expect(leerSesionCache()).toBeNull()
  })
})
