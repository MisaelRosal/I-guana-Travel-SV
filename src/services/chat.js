import { api } from './api.js'
import { getContentLocale } from '../i18n/config.js'

// Chat client for the traveler↔host vertical. Mirrors services/resenas.js:
// thin wrappers over api.js, snake_case wire fields (JsonPropertyName on the
// DTOs), CSRF handled automatically by api.js for POST/PUT. The server derives
// both participants from the auth subject — nothing here addresses another
// user's pair.

// Open-or-get the caller's pair conversation with one host (200 even on the
// first-ever open; 404 when the host has no linked account).
export async function abrirConversacion(anfitrionId) {
  return await api.get(`/Chat/anfitrion/${anfitrionId}`)
}

// Keyset page: up to 50 newest-first messages. `cursor` is the envelope cursor
// ({ before_creado_en, before_id }) or null for the newest page.
export async function getMensajes(conversacionId, cursor = null, language) {
  const params = new URLSearchParams({ contentLocale: getContentLocale(language) })
  if (cursor) {
    params.set('before_creado_en', cursor.before_creado_en)
    params.set('before_id', String(cursor.before_id))
  }
  return await api.get(`/Chat/${conversacionId}/mensajes?${params.toString()}`)
}

// Send one message (201 with the stored row). publicacionId is the optional
// card context bound from experiencia.publicacionId — never the route :id.
export async function enviarMensaje(conversacionId, mensaje, publicacionId, language) {
  const params = new URLSearchParams({ contentLocale: getContentLocale(language) })
  return await api.post(`/Chat/${conversacionId}/mensajes?${params.toString()}`, {
    mensaje,
    publicacion_id: publicacionId ?? null,
  })
}

// Mark the conversation read for the caller (advances only their own stamp).
export async function marcarLeido(conversacionId) {
  return await api.put(`/Chat/${conversacionId}/leido`)
}

// Header badge poll: total unread across the caller's threads.
export async function getNoLeidos() {
  return await api.get('/Chat/no-leidos')
}

// /mensajes inbox: role-filtered thread rows.
export async function getMias() {
  return await api.get('/Chat/mias')
}
