import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subirEvidenciaReporte } from '../reportes.js'

// The multipart evidence upload bypasses the shared api.js wrapper, so it must
// honor the same CSRF contract on its raw fetch call: X-CSRF-Token read from
// the iguana_csrf cookie plus credentials:'include' (the server's
// CsrfMiddleware only recognizes that header/cookie pair).

function okResponse(body = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
  }
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => okResponse({ ok: true }))
})

afterEach(() => {
  document.cookie = 'iguana_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  vi.unstubAllGlobals()
})

describe('subirEvidenciaReporte CSRF contract', () => {
  it('echoes the iguana_csrf cookie in X-CSRF-Token and sends credentials', async () => {
    document.cookie = 'iguana_csrf=evidencia-1'
    await subirEvidenciaReporte(7, new File(['bytes'], 'foto.png'))

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('/api/Reporte/7/evidencias')
    expect(init.method).toBe('POST')
    expect(init.headers['X-CSRF-Token']).toBe('evidencia-1')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('sends no CSRF header when the cookie is absent', async () => {
    await subirEvidenciaReporte(7, new File(['bytes'], 'foto.png'))

    const [, init] = globalThis.fetch.mock.calls[0]
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
  })
})
