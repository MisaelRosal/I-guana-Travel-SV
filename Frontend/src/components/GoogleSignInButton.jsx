import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGoogleClientId, iniciarSesionConGoogle } from '../services/google.js'

// Renders the OFFICIAL Google Identity Services button (brand guidelines) with a
// divider above it. The whole block is hidden until the backend reports a
// configured client id, so the pages are unchanged when Google Sign-In is off
// and in tests (the external script is never reached there).
const SCRIPT_ID = 'google-identity-services'
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let scriptPromise = null

function cargarScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('sin-documento'))
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google)
  }
  if (scriptPromise) {
    return scriptPromise
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existente = document.getElementById(SCRIPT_ID)
    const script = existente || document.createElement('script')
    script.addEventListener('load', () => resolve(window.google))
    script.addEventListener('error', () => {
      scriptPromise = null
      reject(new Error('google-script'))
    })
    if (!existente) {
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
  })

  return scriptPromise
}

export default function GoogleSignInButton({ text = 'continue_with', onExito, onError }) {
  const { t, i18n } = useTranslation('auth')
  const contenedorRef = useRef(null)
  const exitoRef = useRef(onExito)
  const errorRef = useRef(onError)
  const [clientId, setClientId] = useState(null)
  const [conectando, setConectando] = useState(false)

  useEffect(() => {
    exitoRef.current = onExito
    errorRef.current = onError
  })

  // Ask the server whether Google Sign-In is configured.
  useEffect(() => {
    let activo = true
    getGoogleClientId()
      .then((id) => {
        if (activo) setClientId(id || '')
      })
      .catch(() => {
        if (activo) setClientId('')
      })
    return () => {
      activo = false
    }
  }, [])

  // Load the GIS script and mount the button once the client id is known.
  useEffect(() => {
    if (!clientId) {
      return undefined
    }

    let cancelado = false
    cargarScript()
      .then((google) => {
        if (cancelado || !google?.accounts?.id || !contenedorRef.current) {
          return
        }
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async (respuesta) => {
            setConectando(true)
            try {
              const usuario = await iniciarSesionConGoogle(respuesta.credential)
              exitoRef.current?.(usuario)
            } catch (err) {
              errorRef.current?.(err)
            } finally {
              setConectando(false)
            }
          },
        })
        google.accounts.id.renderButton(contenedorRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'left',
          locale: i18n.language === 'en' ? 'en' : 'es',
        })
      })
      .catch(() => {
        if (!cancelado) errorRef.current?.(new Error(t('google.loadError')))
      })

    return () => {
      cancelado = true
    }
  }, [clientId, text, i18n.language, t])

  if (!clientId) {
    return null
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-cafe-claro/60" aria-hidden="true" />
        <span className="text-xs font-semibold text-cafe">
          {t('google.divider')}
        </span>
        <span className="h-px flex-1 bg-cafe-claro/60" aria-hidden="true" />
      </div>

      <div ref={contenedorRef} className="mt-4 flex justify-center" data-testid="google-button" />

      {conectando && (
        <p className="mt-3 text-center text-sm text-cafe">{t('google.connecting')}</p>
      )}
    </div>
  )
}
