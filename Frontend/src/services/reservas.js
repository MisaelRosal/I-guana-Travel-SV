import { api } from './api.js'

export async function getMisReservas() {
  const usuario = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
  if (!usuario) return []

  const reservas = await api.get(`/Reservas/usuario/${usuario.id}`)
  return Array.isArray(reservas) ? reservas : []
}
