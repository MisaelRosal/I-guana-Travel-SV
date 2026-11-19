import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import { api } from '../api.js'
import {
  abrirConversacion,
  enviarMensaje,
  getMensajes,
  getMias,
  getNoLeidos,
  marcarLeido,
} from '../chat.js'

describe('chat service requests', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens the authenticated caller thread by host id', async () => {
    await abrirConversacion(7)

    expect(api.get).toHaveBeenCalledWith('/Chat/anfitrion/7')
  })

  it('requests newest and cursor pages with the selected content locale', async () => {
    await getMensajes(12, null, 'en')
    await getMensajes(12, { before_creado_en: '2026-01-02T03:04:05', before_id: 9 }, 'es')

    expect(api.get).toHaveBeenNthCalledWith(1, '/Chat/12/mensajes?contentLocale=en')
    expect(api.get).toHaveBeenNthCalledWith(
      2,
      '/Chat/12/mensajes?contentLocale=es&before_creado_en=2026-01-02T03%3A04%3A05&before_id=9',
    )
  })

  it('sends publication context and marks only the current conversation read', async () => {
    await enviarMensaje(12, 'Hello', 314, 'en')
    await marcarLeido(12)

    expect(api.post).toHaveBeenCalledWith('/Chat/12/mensajes?contentLocale=en', {
      mensaje: 'Hello',
      publicacion_id: 314,
    })
    expect(api.put).toHaveBeenCalledWith('/Chat/12/leido')
  })

  it('exposes the unread total and role-filtered inbox endpoints', async () => {
    await getNoLeidos()
    await getMias()

    expect(api.get).toHaveBeenNthCalledWith(1, '/Chat/no-leidos')
    expect(api.get).toHaveBeenNthCalledWith(2, '/Chat/mias')
  })
})
