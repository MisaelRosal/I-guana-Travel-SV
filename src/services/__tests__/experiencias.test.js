import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api.js', () => ({
  api: { get: vi.fn() },
}))

import { api } from '../api.js'
import { getCategorias, getExperienciaById, getExperiencias } from '../experiencias.js'

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

// Investigation of the reported "hospedaje filtering doesn't work" catalog bug:
// the DB keeps tipo sane ('experiencia'|'hospedaje', migration
// AddTipoPublicacionCategoria), so the mapper must tag every row from p.tipo
// and the tipo filter must split BOTH sets correctly. If this test is green
// while users still see a broken hospedaje filter, the failure lives in the UI
// layer (category scoping), not in the mapping.
describe('tipo filtering splits experience and hospedaje rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const publicaciones = [{
    id: 1,
    titulo: 'Tour de surf',
    tipo: 'experiencia',
    categoria: { nombre: 'Surf' },
    experiencia: [{ nombre: 'Surf class' }],
    horarios: [],
    imagenesPublicacions: [],
    publicacionAmenidads: [],
  }, {
    id: 2,
    titulo: 'Cabaña frente al lago',
    tipo: 'hospedaje',
    categoria: { nombre: 'Cabaña' },
    horarios: [],
    imagenesPublicacions: [],
    publicacionAmenidads: [],
  }]

  it('hospedaje tipo filter returns only the lodging rows (mapper keeps tipo)', async () => {
    api.get.mockResolvedValue(publicaciones)

    const resultados = await getExperiencias({ tipo: 'hospedaje' })

    expect(resultados).toHaveLength(1)
    expect(resultados[0]).toMatchObject({ id: 2, tipo: 'hospedaje' })
  })

  it('hospedaje tipo + lodging category yields the lodging rows only', async () => {
    api.get.mockResolvedValue(publicaciones)

    const resultados = await getExperiencias({ tipo: 'hospedaje', categoria: 'Cabaña' })

    expect(resultados).toHaveLength(1)
    expect(resultados[0]).toMatchObject({ id: 2, tipo: 'hospedaje', categoria: 'Cabaña' })
  })

  it('experiencia tipo + an incompatible lodging category yields nothing', async () => {
    api.get.mockResolvedValue(publicaciones)

    const resultados = await getExperiencias({ tipo: 'hospedaje', categoria: 'Surf' })

    expect(resultados).toEqual([])
  })
})

// GET /api/Categoria returns each category with its own tipo; the service must
// keep it so the catalog can scope the dropdown by the selected listing type.
describe('getCategorias exposes the backend tipo per category', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns { id, nombre, tipo } objects instead of bare names', async () => {
    api.get.mockResolvedValue([
      { id: 3, nombre: 'Cabaña', tipo: 'hospedaje' },
      { id: 4, nombre: 'Surf', tipo: 'experiencia' },
    ])

    const categorias = await getCategorias()

    expect(categorias).toEqual([
      { id: 3, nombre: 'Cabaña', tipo: 'hospedaje' },
      { id: 4, nombre: 'Surf', tipo: 'experiencia' },
    ])
  })
})
