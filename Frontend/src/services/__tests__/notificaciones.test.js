import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}))

import { api } from '../api.js'
import { getMisNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } from '../notificaciones.js'

describe('site notification requests', () => {
  beforeEach(() => vi.clearAllMocks())

  afterEach(() => {
    document.cookie = 'iguana_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('fetches the caller inbox (newest-first, max 50)', async () => {
    await getMisNotificaciones()

    expect(api.get).toHaveBeenCalledWith('/Notificacione/mias')
  })

  it('marks a single notification read', async () => {
    await marcarNotificacionLeida(42)

    expect(api.put).toHaveBeenCalledWith('/Notificacione/42/leer')
  })

  it('marks the whole inbox read', async () => {
    await marcarTodasLeidas()

    expect(api.put).toHaveBeenCalledWith('/Notificacione/leer-todas')
  })
})
