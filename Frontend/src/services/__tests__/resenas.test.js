import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({
  api: { get: vi.fn(), delete: vi.fn() },
}))

import { api } from '../api.js'
import { eliminarResena, getMisResenas, getResenasPublicacion } from '../resenas.js'

describe('review content locale requests', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    document.cookie = 'iguana_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('requests public comments and host replies in the selected locale', async () => {
    await getResenasPublicacion(42, 'en')

    expect(api.get).toHaveBeenCalledWith('/Resena/publicacion/42?contentLocale=en')
  })

  it('requests the host review inbox in the selected locale', async () => {
    await getMisResenas('es')

    expect(api.get).toHaveBeenCalledWith('/Resena/mias?contentLocale=es')
  })

  it('deletes a review through the moderation endpoint', async () => {
    await eliminarResena(42)

    expect(api.delete).toHaveBeenCalledWith('/Resena/42')
  })
})
