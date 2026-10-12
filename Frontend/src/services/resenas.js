import { api } from './api.js'

// Public: star average + reviews of a publication (detail page).
export async function getResenasPublicacion(publicacionId) {
  return await api.get(`/Resena/publicacion/${publicacionId}`)
}

// Public: batch averages for catalog cards. Publications with no reviews are
// absent from the returned map and the client shows "Aún no tiene reseñas".
export async function getResumenResenas(publicacionIds) {
  if (!publicacionIds || publicacionIds.length === 0) return {}
  return await api.get(`/Resena/resumen?publicaciones=${publicacionIds.join(',')}`)
}

// Public: global star average of a host (public host profile).
export async function getResumenAnfitrion(anfitrionId) {
  return await api.get(`/Resena/anfitrion/${anfitrionId}`)
}

// Host panel: reviews received by the caller's publications (+ per-listing
// averages). Admins see every review.
export async function getMisResenas() {
  return await api.get('/Resena/mias')
}

// Host reply to a review (empty string clears the reply).
export async function responderResena(id, respuesta) {
  return await api.put(`/Resena/${id}/respuesta`, { respuesta: respuesta ?? '' })
}
