import { api } from './api.js'

const imagenesDepartamentos = {
  'San Salvador': 'https://images.unsplash.com/photo-1519452635265-7b1fbfd1e4e0?w=1200',
  'La Libertad': 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1200',
  'Ahuachapán': 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1200',
  'Cuscatlán': 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200',
  'Sonsonate': 'https://images.unsplash.com/photo-1519452635265-7b1fbfd1e4e0?w=1200',
  'Santa Ana': 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1200',
  'Cabañas': 'https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1200',
  'Chalatenango': 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200',
  'La Paz': 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200',
  'La Unión': 'https://images.unsplash.com/photo-1546768292-fb12f6c92568?w=1200',
  'Morazán': 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200',
  'San Miguel': 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200',
  'San Vicente': 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200',
  'Usulután': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200',
}

function mapearPublicacion(p) {
  const experiencia = p.experiencia?.[0] ?? null
  return {
    id: p.id,
    titulo: p.titulo,
    tipo: p.experiencia?.length ? 'experiencia' : 'hospedaje',
    categoria: p.categoria?.nombre ?? '',
    descripcion: p.descripcion ?? '',
    precio: p.precioPorNoche,
    municipio: p.anfitrion?.municipio?.nombre ?? '',
    departamento: p.anfitrion?.municipio?.departamento?.nombre ?? '',
    latitud: p.latitud,
    longitud: p.longitud,
    imagenes: (p.imagenesPublicacions ?? [])
      .slice()
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((i) => i.url),
    capacidad: p.capacidadMaxima,
    duracionHoras: experiencia?.duracionHoras ?? null,
    habitaciones: p.habitaciones ?? null,
    popular: false,
  }
}

export async function getExperiencias({ search = '', categoria = '', zona = '', tipo = '', precioMax = '' } = {}) {
  const publicaciones = await api.get('/Publicacione')
  let resultados = publicaciones.map(mapearPublicacion)

  if (search) {
    const termino = search.toLowerCase()
    resultados = resultados.filter((e) =>
      e.titulo.toLowerCase().includes(termino) ||
      (e.descripcion ?? '').toLowerCase().includes(termino)
    )
  }
  if (categoria) resultados = resultados.filter((e) => e.categoria === categoria)
  if (zona) resultados = resultados.filter((e) => e.departamento === zona)
  if (tipo) resultados = resultados.filter((e) => e.tipo === tipo)
  if (precioMax) resultados = resultados.filter((e) => e.precio <= Number(precioMax))

  return resultados
}

export async function getExperienciaById(id) {
  const publicacion = await api.get(`/Publicacione/${id}`)
  return publicacion ? mapearPublicacion(publicacion) : null
}

export async function getExperienciasPopulares(limite = 5) {
  const publicaciones = await api.get('/Publicacione')
  return publicaciones.map(mapearPublicacion).filter((e) => e.popular).slice(0, limite)
}

export async function getDepartamentos() {
  const departamentos = await api.get('/Departamento')
  return departamentos.map((d) => ({
    id: d.id,
    nombre: d.nombre,
    imagen: imagenesDepartamentos[d.nombre] ?? null,
    municipios: (d.municipios ?? []).map((m) => m.nombre),
  }))
}

export async function getCategorias() {
  const categorias = await api.get('/Categoria')
  return categorias.map((c) => c.nombre)
}