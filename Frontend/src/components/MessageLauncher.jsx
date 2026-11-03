import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import ChatInbox from './ChatInbox.jsx'

export default function MessageLauncher({ unreadCount }) {
  const { t } = useTranslation('chat')
  const [abierto, setAbierto] = useState(false)
  const cerrar = () => setAbierto(false)
  const refDialogo = useModalAccesible(cerrar, abierto)
  const etiqueta = unreadCount > 0
    ? `${t('floating.open')} — ${t('badge.aria', { count: unreadCount })}`
    : t('floating.open')

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={etiqueta}
        aria-expanded={abierto}
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-iguana-hondo text-white shadow-lg transition-colors hover:bg-verde-bosque focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-iguana-hondo/40"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
          <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.5-.8L4 20l1.8-4.2A7.5 7.5 0 1 1 20 11.5Z" />
          <path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01" />
        </svg>
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-700 px-1 text-xs font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {abierto && (
        <div
          ref={refDialogo}
          role="dialog"
          aria-modal="true"
          aria-labelledby="message-inbox-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
        >
          <div className="flex h-[94dvh] max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] bg-crema sm:h-[90vh] sm:max-h-[calc(100dvh-2rem)]">
            <div className="flex shrink-0 items-center justify-between border-b border-cafe-claro/30 px-4 py-3">
              <h2 id="message-inbox-dialog-title" className="text-lg font-bold text-verde-bosque">
                {t('floating.title')}
              </h2>
              <button
                type="button"
                onClick={cerrar}
                aria-label={t('drawer.close')}
                className="cursor-pointer rounded-full p-2 text-cafe transition-colors hover:bg-white hover:text-verde-bosque"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ChatInbox modal />
          </div>
        </div>
      )}
    </>
  )
}
