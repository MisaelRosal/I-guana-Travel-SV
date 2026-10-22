import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({
  api: { get: vi.fn() },
}))

import { api } from '../api.js'
import { getMisReservas } from '../reservas.js'

// Host resume flag: the reservations page needs `cancelacionLibre` and the
// previous date to explain the move and lift the cancel windows, so the mapping
// must surface both without inventing them when absent.
describe('getMisReservas host-reschedule mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.setItem('iguana_usuario', JSON.stringify({ email: 'ana@correo.com' }))
  })

  it('maps cancelacionLibre and reprogramadaDesde from the reservation payload', async () => {
    api.get.mockResolvedValue([
      {
        id: 1,
        publicacionId: 7,
        publicacion: { titulo: 'Ruta', tipo: 'experiencia', horarios: [] },
        fechaInicio: '2027-02-15',
        fechaFin: '2027-02-15',
        estado: 'confirmada',
        cancelacionLibre: true,
        reprogramadaDesde: '2027-01-10',
        numeroHuespedes: 2,
        emailHuesped: 'ana@correo.com',
      },
    ])

    const [reserva] = await getMisReservas()

    expect(reserva.cancelacionLibre).toBe(true)
    expect(reserva.reprogramadaDesde).toBe('2027-01-10')
  })

  it('defaults cancelacionLibre to false and reprogramadaDesde to null when absent', async () => {
    api.get.mockResolvedValue([
      {
        id: 2,
        publicacionId: 7,
        publicacion: { titulo: 'Ruta', tipo: 'experiencia', horarios: [] },
        fechaInicio: '2027-03-15',
        fechaFin: '2027-03-15',
        estado: 'pendiente',
        numeroHuespedes: 1,
        emailHuesped: 'ana@correo.com',
      },
    ])

    const [reserva] = await getMisReservas()

    expect(reserva.cancelacionLibre).toBe(false)
    expect(reserva.reprogramadaDesde).toBeNull()
  })
})
