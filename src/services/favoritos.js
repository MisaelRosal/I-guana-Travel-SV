import { api } from './api.js'
import { getContentLocale } from '../i18n/config.js'
import { mapearPublicacion } from './experiencias.js'

// Fase 2 — publicaciones guardadas (favoritas) del usuario con sesión.
// Todas las rutas viven bajo /api/Favorito y el servidor las acota al `sub` del
// JWT: aquí solo se pinta el resultado, nunca se confía en la lista guardada en
// el cliente. `mios` acepta el mismo contrato `contentLocale` que el catálogo
// (/Publicacione), así la lista de guardadas cambia de idioma igual que las
// lecturas públicas.

function urlMios(contentLocale) {
  const params = new URLSearchParams({ contentLocale: getContentLocale(contentLocale) })
  return `/Favorito/mios?${params.toString()}`
}

/** Ids de las publicaciones guardadas por la sesión actual (barato de leer). */
export async function getIdsFavoritos() {
  return api.get('/Favorito/ids')
}

/** Filas completas ya proyectadas con `mapearPublicacion`, listas para la card. */
export async function getGuardadas(contentLocale) {
  const publicaciones = await api.get(urlMios(contentLocale))
  return publicaciones.map(mapearPublicacion)
}

/** Guardar (idempotente en el servidor): repetir la llamada no duplica nada. */
export async function guardarPublicacion(publicacionId) {
  return api.post(`/Favorito/${publicacionId}`)
}

/** Quitar de guardadas (idempotente): 204 aunque la fila ya no existiera. */
export async function quitarPublicacionGuardada(publicacionId) {
  return api.delete(`/Favorito/${publicacionId}`)
}
