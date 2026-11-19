import { readCsrfToken } from './api.js'

const ENDPOINT = '/api/Asistente/chat'

// The response is NDJSON: one JSON object per line, streamed while the local
// model generates. `onDelta` receives each text piece; the resolved value
// carries the publications the answer actually mentioned.
export async function transmitirAsistente({ mensaje, contentLocale, historial = [] }, onDelta) {
  const token = readCsrfToken()

  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      // The assistant is a POST, so a logged-in caller must clear the CSRF gate.
      ...(token ? { 'X-CSRF-Token': token } : {}),
    },
    body: JSON.stringify({ mensaje, contentLocale, historial }),
  })

  if (!respuesta.ok) {
    let detalle = null
    try {
      detalle = await respuesta.json()
    } catch { /* sin cuerpo JSON */ }
    const error = new Error(detalle?.mensaje || `Error ${respuesta.status}: ${respuesta.statusText}`)
    error.mensaje = detalle?.mensaje
    error.status = respuesta.status
    throw error
  }

  const lector = respuesta.body?.getReader()
  if (!lector) {
    throw new Error('No se pudo leer la respuesta del asistente.')
  }

  const decoder = new TextDecoder()
  let restante = ''
  let publicaciones = []
  let errorServidor = null

  const procesar = (linea) => {
    if (!linea) return
    let evento
    try {
      evento = JSON.parse(linea)
    } catch {
      return
    }
    if (evento.delta) onDelta?.(evento.delta)
    if (evento.publicaciones) publicaciones = evento.publicaciones
    if (evento.error) errorServidor = evento.error
  }

  for (;;) {
    const { value, done } = await lector.read()
    if (done) break
    restante += decoder.decode(value, { stream: true })
    let corte = restante.indexOf('\n')
    while (corte >= 0) {
      procesar(restante.slice(0, corte).trim())
      restante = restante.slice(corte + 1)
      corte = restante.indexOf('\n')
    }
  }
  procesar(restante.trim())

  if (errorServidor) {
    const error = new Error(errorServidor)
    error.mensaje = errorServidor
    throw error
  }

  return { publicaciones }
}
