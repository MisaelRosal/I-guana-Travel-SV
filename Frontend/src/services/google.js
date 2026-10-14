import { api } from './api.js'
import { restaurarSesion } from './session.js'

// Google Sign-In helpers. The client id is read from the backend (not baked
// into the bundle) so the SAME Google OAuth client already configured for
// outbound email drives the button, and the UI can hide it when unset.

/**
 * Public hint: the Google OAuth client id the embedded button must use, or an
 * empty string when Google Sign-In is not configured on the server.
 */
export async function getGoogleClientId() {
  const config = await api.get('/Auth/google-config')
  return config?.clientId || ''
}

/**
 * Exchange the ID token produced by Google Identity Services for a real session.
 * The server verifies the token, links/creates the account and sets the auth
 * cookies; the session is then rehydrated from GET /api/auth/me (server-
 * authoritative), exactly like the password flows.
 */
export async function iniciarSesionConGoogle(credential) {
  await api.post('/Auth/google', { credential })
  return restaurarSesion()
}
