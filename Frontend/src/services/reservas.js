import { api } from './api.js'

function imagenPrincipal(publicacion) {
  const imagenes = publicacion?.imagenesPublicacions ?? []
  if (imagenes.length === 0) return ''
  const principal = imagenes.find((i) => i.esPrincipal)
  return principal?.url ?? imagenes[0].url
}

function formatearFecha(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

export async function getMisReservas() {
  const usuario = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
  if (!usuario?.email) return []

  const todas = await api.get('/Reserva')
  const reservas = Array.isArray(todas) ? todas : []

  return reservas
    .filter((r) => (r.emailHuesped || '').toLowerCase() === usuario.email.toLowerCase())
    .map((r) => ({
      id: r.id,
      publicacionId: r.publicacionId,
      experienciaTitulo: r.publicacion?.titulo ?? 'Experiencia',
      experienciaCategoria: r.publicacion?.categoria?.nombre ?? '',
      experienciaImagen: imagenPrincipal(r.publicacion),
      fechaInicio: formatearFecha(r.fechaInicio),
      fechaFin: formatearFecha(r.fechaFin),
      personas: r.numeroHuespedes ?? 1,
      precioTotal: r.precioTotal ?? 0,
      estado: r.estado ?? 'pendiente',
    }))
}

export async function getDisponibilidad(publicacionId) {
  return await api.get(`/Reserva/disponibilidad/${publicacionId}`)
}

export async function crearReserva({ publicacionId, nombreHuesped, emailHuesped, telefonoHuesped, fechaInicio, fechaFin, numeroHuespedes, precioTotal }) {
  return await api.post('/Reserva', {
    publicacionId,
    nombreHuesped,
    emailHuesped,
    telefonoHuesped,
    fechaInicio,
    fechaFin,
    numeroHuespedes,
    precioTotal,
    estado: 'pendiente',
  })
}