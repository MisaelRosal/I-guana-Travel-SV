import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDateTimeShort } from '../i18n/format.js'

// Bell + accordion inbox for Header. Presentational: the poll state/actions
// arrive in one `datos` prop produced by useNotificaciones in Header (single
// shared poll, same pattern as the unread-chat badge). The panel mirrors the
// user-dropdown card styling (rounded-[22px], border-cafe-claro/40, bg-white)
// and the badge reuses the Header unread-pill visual language. `mensaje` is
// server Spanish rendered AS-IS; only the chrome is translated.
export default function NotificacionesCampana({ datos }) {
  const { t } = useTranslation('header')
  const locale = useFormatLocale()
  const { notificaciones, sinLeer, cargando, error, marcarLeida, marcarTodas } = datos
  const [abierto, setAbierto] = useState(false)

  // Close on Escape / outside click, same data-attribute pattern as Header's
  // user dropdown, kept local to this component.
  useEffect(() => {
    if (!abierto) return undefined
    const cerrarConEscape = (e) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    const cerrarConClickFuera = (e) => {
      if (!e.target.closest('[data-menu-notificaciones]')) setAbierto(false)
    }
    window.addEventListener('keydown', cerrarConEscape)
    window.addEventListener('click', cerrarConClickFuera)
    return () => {
      window.removeEventListener('keydown', cerrarConEscape)
      window.removeEventListener('click', cerrarConClickFuera)
    }
  }, [abierto])

  const nombreCampana = sinLeer > 0
    ? t('notifications.unreadLabel', { count: sinLeer })
    : t('notifications.title')

  return (
    <div className="relative flex items-center" data-menu-notificaciones>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={nombreCampana}
        className="relative flex cursor-pointer items-center justify-center rounded-full p-2 text-white/90 transition-colors hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-iguana-hondo px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
            {sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div role="menu" aria-label={t('notifications.title')} className="absolute right-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-cafe-claro/40 px-4 py-3">
            <span className="text-sm font-bold text-cafe">{t('notifications.title')}</span>
            <button
              type="button"
              role="menuitem"
              onClick={() => { marcarTodas().catch(() => {}) }}
              className="cursor-pointer text-xs font-semibold text-verde-bosque transition-colors hover:text-iguana-hondo"
            >
              {t('notifications.markAll')}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {cargando && notificaciones.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-cafe">{t('notifications.loading')}</p>
            )}
            {!cargando && error && notificaciones.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-cafe">{t('notifications.error')}</p>
            )}
            {!cargando && !error && notificaciones.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-cafe">{t('notifications.empty')}</p>
            )}
            {notificaciones.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); marcarLeida(n.id).catch(() => {}) }}
                className="flex w-full cursor-pointer items-start gap-2 border-b border-cafe-claro/30 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-crema"
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.leida ? 'bg-transparent' : 'bg-iguana-hondo'}`}
                />
                <span className="flex flex-col gap-0.5">
                  <span className={`text-sm leading-snug ${n.leida ? 'text-cafe' : 'font-semibold text-verde-bosque'}`}>
                    {n.mensaje}
                  </span>
                  <span className="text-xs text-cafe">
                    {n.creadoEn ? formatDateTimeShort(n.creadoEn, locale) : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
