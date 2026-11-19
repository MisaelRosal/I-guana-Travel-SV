import { beforeEach, describe, expect, it, vi } from 'vitest'

// Google Sign-In service. The client id must come from the backend (so the same
// OAuth client used for email can drive the button and the UI can hide it when
// unset), and signing in must exchange the Google credential for a real session
// rehydrated from the server — never assembled from the credential.

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  restaurarSesion: vi.fn(),
}))

vi.mock('../api.js', () => ({ api: { get: mocks.get, post: mocks.post } }))
vi.mock('../session.js', () => ({ restaurarSesion: mocks.restaurarSesion }))

import { getGoogleClientId, iniciarSesionConGoogle } from '../google.js'

beforeEach(() => {
  mocks.get.mockReset()
  mocks.post.mockReset()
  mocks.restaurarSesion.mockReset()
})

describe('getGoogleClientId', () => {
  it('reads the client id from the backend config endpoint', async () => {
    mocks.get.mockResolvedValue({ clientId: 'abc.apps.googleusercontent.com' })

    await expect(getGoogleClientId()).resolves.toBe('abc.apps.googleusercontent.com')
    expect(mocks.get).toHaveBeenCalledWith('/Auth/google-config')
  })

  it('returns an empty string when the server omits the id', async () => {
    mocks.get.mockResolvedValue({})

    await expect(getGoogleClientId()).resolves.toBe('')
  })
})

describe('iniciarSesionConGoogle', () => {
  it('posts the credential then rehydrates the session from the server', async () => {
    const usuario = { id: 1, email: 'g@google.test' }
    mocks.post.mockResolvedValue({ mensaje: 'ok' })
    mocks.restaurarSesion.mockResolvedValue(usuario)

    await expect(iniciarSesionConGoogle('tok')).resolves.toEqual(usuario)
    expect(mocks.post).toHaveBeenCalledWith('/Auth/google', { credential: 'tok' })
    expect(mocks.restaurarSesion).toHaveBeenCalledTimes(1)
  })

  it('propagates the server rejection and never rehydrates', async () => {
    const error = Object.assign(new Error('nope'), { status: 401 })
    mocks.post.mockRejectedValue(error)

    await expect(iniciarSesionConGoogle('tok')).rejects.toBe(error)
    expect(mocks.restaurarSesion).not.toHaveBeenCalled()
  })
})
