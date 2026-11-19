import { api } from './api.js'

// The browser session is authoritative only on the server (the HttpOnly JWT
// cookie). sessionStorage below is a UI-only cache so the header/name can render
// instantly; its contents are revalidated against GET /api/auth/me. It is NOT a
// security control — never trust a role read straight from here for anything the
// server does not also enforce (see W3b).
const SESSION_KEY = 'iguana_usuario'

export function leerSesionCache() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function guardarSesionCache(usuario) {
  if (usuario) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(usuario))
  } else {
    sessionStorage.removeItem(SESSION_KEY)
  }
  // Same in-tab signal the rest of the app listens for (Header/Footer react).
  window.dispatchEvent(new Event('auth-change'))
}

/**
 * Rehydrate the current session from the server. Returns the authenticated user
 * derived from the auth cookie, or null when there is no valid session. The
 * role comes fresh from the database, so this is the source of truth (the cache
 * is only a rendering convenience).
 */
export async function restaurarSesion() {
  try {
    const usuario = await api.get('/Auth/me')
    guardarSesionCache(usuario)
    return usuario
  } catch {
    // 401 (or network error) => no valid session; drop the stale cache.
    guardarSesionCache(null)
    return null
  }
}

/**
 * Clear the session on both sides: ask the server to expire the cookies, then
 * drop the local cache. Safe to call even if already signed out.
 */
export async function cerrarSesion() {
  try {
    await api.post('/Auth/logout')
  } catch {
    /* the cookies are best-effort; always clear the local cache below */
  }
  guardarSesionCache(null)
}
