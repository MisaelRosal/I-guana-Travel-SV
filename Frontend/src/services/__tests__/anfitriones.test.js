import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMiPerfil, actualizarMiPerfilAnfitrion } from '../anfitriones.js'

// Contract of the W4 self-service host-profile helpers. Same stubbing
// technique as api.test.js: fetch is replaced per test; CSRF/credentials are
// api.js' own contract, asserted here end-to-end through the service layer.
// The helpers must hit /Anfitrione/mi-perfil (owner resolved server-side from
// the token), never the /Anfitrione list + usuarioId find that the PII
// projection removed.

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
  globalThis.fetch = vi.fn(async () => okResponse({ id: 7 }))
})

afterEach(() => {
  // Isolate the CSRF cookie between tests (jsdom persists it otherwise).
  document.cookie = 'iguana_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  vi.unstubAllGlobals()
})

describe('getMiPerfil', () => {
  it('GETs /api/Anfitrione/mi-perfil with credentials and no CSRF header', async () => {
    document.cookie = 'iguana_csrf=token-mi-perfil'
    const perfil = await getMiPerfil()

    expect(perfil).toEqual({ id: 7 })
    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/Anfitrione/mi-perfil')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('include')
    expect(init.headers['X-CSRF-Token']).toBeUndefined()
  })
})

describe('actualizarMiPerfilAnfitrion', () => {
  it('PUTs the JSON payload to /api/Anfitrione/mi-perfil echoing the CSRF token', async () => {
    document.cookie = 'iguana_csrf=token-put-mi-perfil'
    const datos = {
      email: 'anfitrion@ruta.test',
      telefono: '7777-8888',
      municipioId: 5,
      descripcion: 'Bienvenidos a mi casa.',
    }
    globalThis.fetch = vi.fn(async () => okResponse({ ...datos, id: 7 }))

    const perfil = await actualizarMiPerfilAnfitrion(datos)

    expect(perfil.id).toBe(7)
    const [url, init] = lastFetchCall()
    expect(url).toBe('/api/Anfitrione/mi-perfil')
    expect(init.method).toBe('PUT')
    expect(init.credentials).toBe('include')
    expect(init.headers['X-CSRF-Token']).toBe('token-put-mi-perfil')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual(datos)
  })

  it('surfaces the server 409 mensaje for an email already taken', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({ mensaje: 'Ese correo ya está registrado por otro anfitrión.' }),
    }))

    await expect(actualizarMiPerfilAnfitrion({ email: 'otro@ruta.test' })).rejects.toMatchObject({
      mensaje: 'Ese correo ya está registrado por otro anfitrión.',
      status: 409,
    })
  })

  it('a 404 (no host row) throws with status 404 so callers keep their null state', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ mensaje: 'El usuario no tiene un perfil de anfitrión.' }),
    }))

    await expect(getMiPerfil()).rejects.toMatchObject({ status: 404 })
  })
})
