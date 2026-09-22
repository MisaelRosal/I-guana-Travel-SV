import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, readCsrfToken } from '../api.js'

// W3a client-side security contract, unit-tested without any server:
//   * state-changing calls (POST/PUT/PATCH/DELETE) echo the readable
//     `iguana_csrf` cookie in the X-CSRF-Token header (double-submit);
//   * every request sends credentials:'include' so the HttpOnly auth
//     cookie actually rides along;
//   * GETs never carry the CSRF header (the middleware exempts them).
// fetch is stubbed per test; document.cookie is the jsdom one.

function okResponse(body = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  }
}

function lastFetchCall() {
  expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  return globalThis.fetch.mock.calls[0]
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => okResponse({ ok: true }))
})

afterEach(() => {
  // Isolate the CSRF cookie between tests (jsdom persists it otherwise).
  document.cookie = 'iguana_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  vi.unstubAllGlobals()
})

describe('readCsrfToken', () => {
  it('reads the iguana_csrf cookie and URL-decodes it', () => {
    document.cookie = 'iguana_csrf=abc%3Ddef'
    expect(readCsrfToken()).toBe('abc=def')
  })

  it('returns empty string when the cookie is absent', () => {
    expect(readCsrfToken()).toBe('')
  })

  it('finds the cookie among other cookies', () => {
    // One assignment per cookie: `document.cookie = 'a=1; b=2'` would treat
    // everything after the first pair as attributes, exactly like a browser.
    document.cookie = 'other=1'
    document.cookie = 'iguana_csrf=xyz789'
    document.cookie = 'another=2'
    expect(readCsrfToken()).toBe('xyz789')
  })
})

describe('CSRF header on mutations', () => {
  it('POST sends X-CSRF-Token read from the iguana_csrf cookie', async () => {
    document.cookie = 'iguana_csrf=token-post-1'
    await api.post('/Ruta', { a: 1 })

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/Ruta')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('token-post-1')
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('%s also sends the header', async (method) => {
    document.cookie = 'iguana_csrf=token-multi'
    await request({ method })

    const [, init] = lastFetchCall()
    expect(init.headers['X-CSRF-Token']).toBe('token-multi')
  })

  async function request({ method }) {
    if (method === 'PUT') return api.put('/Ruta', { a: 1 })
    if (method === 'PATCH') return api.patch('/Ruta', { a: 1 })
    return api.delete('/Ruta')
  }

  it('mutation without the cookie sends no CSRF header (server decides)', async () => {
    await api.post('/Ruta', { a: 1 })
    const [, init] = lastFetchCall()
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('a JSON body gets Content-Type application/json', async () => {
    await api.post('/Ruta', { a: 1 })
    const [, init] = lastFetchCall()
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('a bodyless POST does not set Content-Type', async () => {
    await api.post('/Auth/logout')
    const [, init] = lastFetchCall()
    expect(init.headers['Content-Type']).toBeUndefined()
  })
})

describe('GET requests', () => {
  it('never carry the CSRF header even with the cookie present', async () => {
    document.cookie = 'iguana_csrf=should-not-appear'
    await api.get('/Ruta')

    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/Ruta')
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
  })
})

describe('credentials', () => {
  it.each(['get', 'post', 'put', 'delete'])('api.%s sends credentials:"include"', async (fn) => {
    await api[fn]('/Ruta', { a: 1 })
    const [, init] = lastFetchCall()
    expect(init.credentials).toBe('include')
  })
})

describe('error and response handling', () => {
  it('throws a JSON body error with the server status on failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ mensaje: 'solapamiento' }),
    }))

    await expect(api.post('/Reserva', {})).rejects.toMatchObject({
      message: 'solapamiento',
      status: 409,
    })
  })

  it('throws a status-derived message when the error body is not JSON', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new Error('not json')
      },
    }))

    await expect(api.get('/Ruta')).rejects.toThrow('Error 500: Internal Server Error')
  })

  it('returns null for 204 no-content', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 204,
      statusText: 'No Content',
      json: async () => {
        throw new Error('should not be called')
      },
    }))

    await expect(api.delete('/Ruta')).resolves.toBeNull()
  })
})
