import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../../i18n/config.js'
import { localePath } from '../../i18n/routes.jsx'
import { getMias } from '../../services/chat.js'
import { leerSesionCache } from '../../services/session.js'
import { ChatConversation } from '../../components/ChatPanel.jsx'

function fechaPreview(valor, locale) {
  if (!valor) return ''
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale)
}

/**
 * /mensajes — unified inbox for both roles (design decision 6). Rows come from
 * GET /api/Chat/mias scoped by server-side participation; opening a thread
 * mounts the shared ChatConversation, whose first page marks foreign messages
 * read exactly like the drawer does. Unauthenticated visitors get the same
 * login-CTA card the booking form uses.
 */
export default function ChatPage() {
  const { t } = useTranslation('chat')
  const locale = useFormatLocale()
  const location = useLocation()
  const [usuario] = useState(leerSesionCache)
  const [hilos, setHilos] = useState(null)
  const [error, setError] = useState(null)
  const [seleccion, setSeleccion] = useState(null)

  useEffect(() => {
    if (!usuario) return
    let vivo = true
    getMias()
      .then((h) => { if (vivo) setHilos(h) })
      .catch((e) => { if (vivo) setError(e.mensaje || t('page.error')) })
    return () => { vivo = false }
  }, [usuario, t])

  if (!usuario) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-[22px] border border-dashed border-iguana-hondo/40 bg-iguana-hondo/5 p-6 text-center">
          <h1 className="text-xl font-bold text-verde-bosque">{t('page.loginTitle')}</h1>
          <p className="mt-2 text-sm text-cafe">{t('page.loginBody')}</p>
          <Link
            to={localePath('login')}
            state={{ from: location.pathname }}
            className="mt-4 inline-block cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-verde-bosque"
          >
            {t('page.loginCta')}
          </Link>
        </div>
      </div>
    )
  }

  const abrir = (hilo) => {
    setSeleccion(hilo)
    // The opened thread marks itself read; zero the row locally so the inbox
    // reflects it without waiting for a refetch.
    setHilos((prev) =>
      (prev ?? []).map((h) => (h.conversacion_id === hilo.conversacion_id ? { ...h, no_leidos: 0 } : h)),
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-verde-bosque">{t('page.title')}</h1>

      {error && <p className="mt-4 text-red-700">{error}</p>}
      {!error && !hilos && <p className="mt-4 text-cafe">{t('page.loading')}</p>}
      {!error && hilos && hilos.length === 0 && (
        <p className="mt-4 text-cafe">{t('page.empty')}</p>
      )}

      {hilos && hilos.length > 0 && (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <ul className={`flex-col gap-2 rounded-[22px] border border-neutral-200 bg-white p-2 ${seleccion ? 'hidden lg:flex' : 'flex'}`}>
            {hilos.map((hilo) => (
              <li key={hilo.conversacion_id}>
                <button
                  type="button"
                  onClick={() => abrir(hilo)}
                  aria-label={t('page.open')}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[22px] px-3 py-3 text-left transition-colors hover:bg-crema ${
                    seleccion?.conversacion_id === hilo.conversacion_id ? 'bg-crema' : ''
                  }`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-crema text-lg font-bold text-cafe">
                    {hilo.contra_foto ? (
                      <img src={hilo.contra_foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (hilo.contra_nombre || '').charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold text-verde-bosque">{hilo.contra_nombre}</span>
                      <span className="shrink-0 text-xs text-cafe">{fechaPreview(hilo.ultimo_mensaje_en, locale)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-cafe">
                        {hilo.ultimo_mensaje_texto || t('page.noPreview')}
                      </span>
                      {hilo.no_leidos > 0 && (
                        <span className="shrink-0 rounded-full bg-iguana-hondo px-2 py-0.5 text-xs font-bold text-white">
                          {t('page.unread', { count: hilo.no_leidos })}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className={`flex min-h-[420px] flex-col rounded-[22px] border border-neutral-200 bg-crema lg:col-span-3 ${seleccion ? 'flex' : 'hidden lg:flex'}`}>
            {seleccion ? (
              <>
                <div className="flex items-center gap-3 border-b border-cafe-claro/30 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setSeleccion(null)}
                    className="cursor-pointer rounded-full px-3 py-1 text-sm font-semibold text-verde-bosque transition-colors hover:bg-white"
                  >
                    ← {t('page.back')}
                  </button>
                  <h2 className="truncate font-bold text-verde-bosque">{seleccion.contra_nombre}</h2>
                </div>
                <ChatConversation
                  key={seleccion.conversacion_id}
                  conversacionId={seleccion.conversacion_id}
                />
              </>
            ) : (
              <p className="m-auto px-6 text-center text-sm italic text-cafe">{t('page.selectHint')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
