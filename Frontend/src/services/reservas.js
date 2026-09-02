import { api } from './api.js'

export async function getMisReservas() {
  const usuario = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
  if (!usuario) return []

  const reservas = await api.get(`/Reserva/usuario/${usuario.id}`)
  return Array.isArray(reservas) ? reservas : []
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
