import { api } from './api.js'

// Site notifications for the logged-in user; thin wrappers like services/resenas.js.
// `mensaje` arrives in neutral Spanish from the server and is rendered as-is.

// Newest-first inbox: { notificaciones: [...], sinLeer } — max 50 rows, 401 if anon.
export async function getMisNotificaciones() {
  return await api.get('/Notificacione/mias')
}

// Mark one notification read (204; 404 when the caller is not the owner).
export async function marcarNotificacionLeida(id) {
  return await api.put(`/Notificacione/${id}/leer`)
}

// Mark the whole inbox read (200 with { cantidad }).
export async function marcarTodasLeidas() {
  return await api.put('/Notificacione/leer-todas')
}
