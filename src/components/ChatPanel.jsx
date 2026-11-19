import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import { useFormatLocale } from '../i18n/config.js'
import { formatPrice } from '../i18n/format.js'
import { localePath } from '../i18n/routes.jsx'
import { leerSesionCache } from '../services/session.js'
import { abrirConversacion, enviarMensaje, getMensajes, marcarLeido } from '../services/chat.js'

// An open thread polls while it is visible: 4 s cadence, paused while the tab
// is hidden, immediate tick on return, stopped on close/unmount (design AD-1).
// The Header badge uses its own slower poll (useChatNoLeidos), never this one.
const INTERVALO_HILO_MS = 4000
const MAX_CARACTERES = 500

function formatoMomento(valor, locale) {
  const d = new Date(valor)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function TarjetaPublicacion({ publicacion }) {
  const { t } = useTranslation('chat')
  const locale = useFormatLocale()
  return (
    <div className="mt-2 rounded-[22px] border border-cafe-claro/50 bg-white p-3">
      <p className="text-xs font-semibold uppercase text-cafe">{t('drawer.publicationCard.label')}</p>
      <p className="mt-0.5 font-semibold text-verde-bosque">{publicacion.titulo}</p>
      <p className="mt-0.5 font-bold text-iguana-hondo">
        {formatPrice(publicacion.precio, locale)}
      </p>
      <Link
        to={localePath('experienceDetail', { id: publicacion.id })}
        className="mt-1 inline-block text-sm font-medium text-azul hover:text-verde-hoja"
      >
        {t('drawer.publicationCard.view')}
      </Link>
    </div>
  )
}

/**
 * The thread itself (messages + composer + polling), shared by the ChatPanel
 * drawer and the /mensajes page so the chat logic exists exactly once (design
 * decision 6). Cards render from each message's own `publicacion` projection;
 * `publicacionId` is only the context attached to NEW sends.
 */
export function ChatConversation({ conversacionId, publicacionId = null }) {
  const { t, i18n } = useTranslation('chat')
  const locale = useFormatLocale()
  const miId = leerSesionCache()?.id ?? null
  const [mensajes, setMensajes] = useState([])
  const [hayMasAnteriores, setHayMasAnteriores] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false)
  const [error, setError] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState(null)
  const listaRef = useRef(null)
  const totalAnteriorRef = useRef(0)
  // Highest foreign message id that already triggered a leido PUT (see below).
  const ultimaMarcaRef = useRef(null)

  // Merge-by-id keeps locally appended older rows while polling brings newer
  // ones; display order is oldest → newest.
  const fusionar = useCallback((nuevos) => {
    setMensajes((previos) => {
      const porId = new Map(previos.map((m) => [m.id, m]))
      for (const m of nuevos) porId.set(m.id, m)
      return [...porId.values()].sort((a, b) =>
        a.creado_en === b.creado_en ? a.id - b.id : a.creado_en < b.creado_en ? -1 : 1,
      )
    })
  }, [])

  const marcarSiHayNuevosDeOtros = useCallback((pagina) => {
    if (miId == null) return
    const foraneos = pagina.mensajes.filter((m) => m.emisor_usuario_id !== miId)
    if (foraneos.length === 0) return
    // Mark on open and then only when NEW foreign rows appear — a steady poll
    // over the same page must not re-PUT leido every 4 seconds.
    const maxForaneo = Math.max(...foraneos.map((m) => m.id))
    if (ultimaMarcaRef.current != null && maxForaneo <= ultimaMarcaRef.current) return
    ultimaMarcaRef.current = maxForaneo
    // Server advances ONLY this caller's stamp; failures never block the UI.
    marcarLeido(conversacionId).catch(() => {})
  }, [conversacionId, miId])

  const cargarRecientes = useCallback(async () => {
    // Newest page: the server fixed size is 50; a full page MAY have older rows.
    const pagina = await getMensajes(conversacionId, null, i18n.resolvedLanguage || i18n.language)
    fusionar(pagina.mensajes)
    setHayMasAnteriores(pagina.mensajes.length === 50)
    marcarSiHayNuevosDeOtros(pagina)
    setError(null)
  }, [conversacionId, fusionar, i18n, marcarSiHayNuevosDeOtros])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    cargarRecientes()
      .catch((e) => { if (vivo) setError(e.mensaje || t('drawer.error')) })
      .finally(() => { if (vivo) setCargando(false) })

    const tick = () => {
      if (!vivo || document.hidden) return
      cargarRecientes().catch(() => {})
    }
    const intervalo = setInterval(tick, INTERVALO_HILO_MS)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [cargarRecientes, t])

  // Keep the newest message in view when the thread grows.
  useEffect(() => {
    const el = listaRef.current
    if (el && mensajes.length > totalAnteriorRef.current) {
      el.scrollTop = el.scrollHeight
    }
    totalAnteriorRef.current = mensajes.length
  }, [mensajes])

  const cargarAnteriores = async () => {
    if (mensajes.length === 0) return
    setCargandoAnteriores(true)
    try {
      const oldest = mensajes[0]
      const pagina = await getMensajes(
        conversacionId,
        { before_creado_en: oldest.creado_en, before_id: oldest.id },
        i18n.resolvedLanguage || i18n.language,
      )
      fusionar(pagina.mensajes)
      setHayMasAnteriores(pagina.mensajes.length === 50)
    } catch (e) {
      setError(e.mensaje || t('drawer.error'))
    } finally {
      setCargandoAnteriores(false)
    }
  }

  const enviar = async (evento) => {
    evento.preventDefault()
    const recortado = texto.trim()
    if (!recortado || recortado.length > MAX_CARACTERES || enviando) return
    setEnviando(true)
    setErrorEnvio(null)
    try {
      const item = await enviarMensaje(
        conversacionId,
        recortado,
        publicacionId,
        i18n.resolvedLanguage || i18n.language,
      )
      fusionar([item])
      setTexto('')
    } catch (e) {
      setErrorEnvio(e.mensaje || t('drawer.error'))
    } finally {
      setEnviando(false)
    }
  }

  const demasiadoLargo = texto.length > MAX_CARACTERES

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listaRef}
        role="log"
        aria-live="polite"
        aria-label={t('aria.liveRegion')}
        className="flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        {cargando && <p className="py-6 text-center text-sm text-cafe">{t('drawer.loading')}</p>}
        {!cargando && error && <p className="py-6 text-center text-sm text-red-700">{error}</p>}
        {!cargando && !error && mensajes.length === 0 && (
          <p className="py-6 text-center text-sm italic text-cafe">{t('drawer.empty')}</p>
        )}
        {!cargando && !error && hayMasAnteriores && (
          <div className="text-center">
            <button
              type="button"
              onClick={cargarAnteriores}
              disabled={cargandoAnteriores}
              className="cursor-pointer rounded-full border border-cafe-claro bg-white px-4 py-1.5 text-xs font-semibold text-verde-bosque transition-colors hover:bg-crema disabled:opacity-50"
            >
              {cargandoAnteriores ? t('drawer.loading') : t('drawer.loadOlder')}
            </button>
          </div>
        )}
        {mensajes.map((m) => {
          const propio = miId != null && m.emisor_usuario_id === miId
          return (
            <div key={m.id} className={propio ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
              <div className={`max-w-[90%] rounded-[22px] px-5 py-3 text-base leading-6 sm:max-w-[80%] ${propio ? 'bg-iguana-hondo text-white' : 'bg-white border border-cafe-claro/50 text-neutral-800'}`}>
                <p className="text-sm font-semibold opacity-80">
                  {propio ? t('drawer.sentYou') : m.emisor_nombre}
                  <span className="mx-1 opacity-60">·</span>
                  {formatoMomento(m.creado_en, locale)}
                </p>
                {/* Stored message bodies are original-language, always verbatim. */}
                <p className="mt-1 whitespace-pre-line break-words">{m.mensaje}</p>
                {m.publicacion && <TarjetaPublicacion publicacion={m.publicacion} />}
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={enviar} className="border-t border-cafe-claro/30 bg-crema px-4 py-4">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder={t('drawer.placeholder')}
          aria-label={t('drawer.placeholder')}
          className="w-full rounded-[22px] border border-neutral-300 bg-white px-4 py-3 text-base leading-6 text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40"
        >
        </textarea>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className={`text-xs ${demasiadoLargo ? 'font-semibold text-red-700' : 'text-cafe'}`}>
            {t('drawer.counter', { count: texto.length })}
            {demasiadoLargo && ` — ${t('drawer.counterLimit')}`}
          </span>
          {errorEnvio && <span className="text-xs font-medium text-red-700">{errorEnvio}</span>}
          <button
            type="submit"
            disabled={!texto.trim() || demasiadoLargo || enviando}
            className="cursor-pointer rounded-full bg-iguana-hondo px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-verde-bosque disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? t('drawer.sending') : t('drawer.send')}
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Drawer shell for the two entry points (host profile "Contáctame" and the
 * experience-detail host card). Same dialog pattern as CrearPublicacionModal:
 * mounted by the parent, toggled with `abierto`; accessibility (focus trap,
 * Escape, focus return) comes from useModalAccesible.
 */
export default function ChatPanel({ abierto, anfitrionId, publicacionId = null, onCerrar }) {
  const { t } = useTranslation('chat')
  const [conversacionId, setConversacionId] = useState(null)
  const [error, setError] = useState(null)
  const refDialogo = useModalAccesible(onCerrar, abierto)

  // One open-or-get per host thread while the drawer is open (200 on create;
  // a NULL host binding answers 404 with a Spanish mensaje).
  useEffect(() => {
    if (!abierto || !anfitrionId || conversacionId) return
    let vivo = true
    setError(null)
    abrirConversacion(anfitrionId)
      .then((c) => { if (vivo) setConversacionId(c.id) })
      .catch((e) => { if (vivo) setError(e.mensaje || t('drawer.error')) })
    return () => { vivo = false }
  }, [abierto, anfitrionId, conversacionId, t])

  if (!abierto) return null

  return (
    <div
      ref={refDialogo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-panel-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex h-[90vh] max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] bg-crema">
        <div className="flex items-center justify-between border-b border-cafe-claro/30 px-4 py-3">
          <h2 id="chat-panel-titulo" className="text-base font-bold text-verde-bosque">
            {t('drawer.title')}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('drawer.close')}
            className="cursor-pointer rounded-full p-2 text-cafe transition-colors hover:bg-white hover:text-verde-bosque"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {error ? (
          <p className="px-4 py-8 text-center text-sm text-red-700">{error}</p>
        ) : conversacionId ? (
          <ChatConversation conversacionId={conversacionId} publicacionId={publicacionId} />
        ) : (
          <p className="px-4 py-8 text-center text-sm text-cafe">{t('drawer.loading')}</p>
        )}
      </div>
    </div>
  )
}
