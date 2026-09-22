const BASE_URL = '/api'

// Readable (non-HttpOnly) CSRF cookie set by the server on login/register.
// Double-submit pattern: the SPA echoes this value in the X-CSRF-Token header
// on every state-changing call; the server compares header vs cookie. A
// cross-site attacker can force a cookie to be SENT but can never READ it,
// so it cannot craft the matching header.
export function readCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)iguana_csrf=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()

  const headers = { ...(options.headers || {}) }

  // Let the browser set the multipart boundary for FormData; otherwise JSON.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const hasContentType = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')
  if (!hasContentType && options.body != null && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  // Attach the double-submit CSRF token to state-changing requests.
  if (MUTATION_METHODS.has(method)) {
    const token = readCsrfToken()
    if (token && !Object.keys(headers).some((k) => k.toLowerCase() === 'x-csrf-token')) {
      headers['X-CSRF-Token'] = token
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    // The auth cookie is HttpOnly; the browser only attaches it when credentials
    // are included. Same for the CORS credentialed policy on the server.
    credentials: 'include',
    ...options,
    method,
    headers,
  })

  if (!res.ok) {
    let detalle = null
    try {
      detalle = await res.json()
    } catch (e) { /* sin cuerpo JSON */ }
    const error = new Error(detalle?.mensaje || `Error ${res.status}: ${res.statusText}`)
    error.mensaje = detalle?.mensaje
    error.status = res.status
    throw error
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body == null ? undefined : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: body == null ? undefined : JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body == null ? undefined : JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}
