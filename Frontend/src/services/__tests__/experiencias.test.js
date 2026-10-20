import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({
  api: { get: vi.fn() },
}))

import { api } from '../api.js'
import { getExperienciaById, getExperiencias } from '../experiencias.js'

describe('publication content locale requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests English content and searches the selected title and description', async () => {
    api.get.mockResolvedValue([{
      id: 5,
      titulo: 'Coastal stay',
      descripcion: 'Walk along the coast',
      tipo: 'hospedaje',
      categoria: { nombre: 'Stay' },
      horarios: [],
      imagenesPublicacions: [],
      publicacionAmenidads: [],
    }])

    const results = await getExperiencias({ locale: 'en', search: 'coast' })

    expect(api.get).toHaveBeenCalledWith('/Publicacione?contentLocale=en')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ titulo: 'Coastal stay', descripcion: 'Walk along the coast' })
  })

  it('requests the selected locale for the public detail endpoint', async () => {
    api.get.mockResolvedValue({ id: 314, titulo: 'Casa', tipo: 'hospedaje' })

    const experiencia = await getExperienciaById(9, 'en')

    expect(api.get).toHaveBeenCalledWith('/Publicacione/9?contentLocale=en')
    expect(experiencia.publicacionId).toBe(314)
  })

  it('excludes blocked horarios from the public availability lists', async () => {
    api.get.mockResolvedValue([{
      id: 20,
      titulo: 'Caminata al volcán',
      tipo: 'experiencia',
      experiencia: [{ nombre: 'Caminata al volcán' }],
      categoria: { nombre: 'Naturaleza' },
      horarios: [
        { fecha: '2099-12-01', horaInicio: '08:00', horaFin: '12:00', disponible: true },
        { fecha: '2099-12-02', horaInicio: '08:00', horaFin: '12:00', disponible: false },
      ],
      imagenesPublicacions: [],
      publicacionAmenidads: [],
    }])

    const [result] = await getExperiencias({ locale: 'es' })

    expect(result.fechasDisponibles).toEqual(['2099-12-01'])
    expect(result.proximaFecha).toBe('2099-12-01')
  })

  it('maps localized nested experience names and descriptions', async () => {
    api.get.mockResolvedValue([{
      id: 12,
      titulo: 'Coffee farm walk',
      descripcion: 'Visit the local farms',
      tipo: 'experiencia',
      experiencia: [{ nombre: 'Coffee tasting', descripcion: 'Try local coffee' }],
      categoria: { nombre: 'Nature' },
      horarios: [],
      imagenesPublicacions: [],
      publicacionAmenidads: [],
    }])

    const [result] = await getExperiencias({ locale: 'en' })

    expect(result.experiencias).toEqual([{
      nombre: 'Coffee tasting',
      descripcion: 'Try local coffee',
      duracionHoras: null,
      precioAdicional: null,
    }])
  })
})
