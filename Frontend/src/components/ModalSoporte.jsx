import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import { crearSoporte } from '../services/soporte.js'

const inputCls = 'w-full rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40'
const labelCls = 'mb-1 block text-sm font-semibold text-verde-bosque'

export default function ModalSoporte({ usuario, onCerrar }) {
  const { t } = useTranslation('footer')
  const [nombre, setNombre] = useState(
    usuario ? `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() : '',
  )
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)
  const ref = useModalAccesible(onCerrar, true)

  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await crearSoporte({ nombre, email, asunto, mensaje })
      setEnviado(true)
    } catch (err) {
      setError(err.mensaje || err.message || t('support.error'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="soporte-titulo"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="soporte-titulo" className="text-xl font-bold text-verde-bosque">
              {t('support.title')}
            </h2>
            <p className="mt-1 text-sm text-cafe">{t('support.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('support.close')}
            className="cursor-pointer rounded-full p-1 text-xl leading-none text-cafe transition-colors hover:bg-crema hover:text-verde-bosque"
          >
            &times;
          </button>
        </div>

        {enviado ? (
          <div className="mt-6 text-center">
            <p className="rounded-[22px] bg-verde-hoja/10 px-4 py-6 text-sm font-semibold text-verde-bosque" role="status">
              {t('support.success')}
            </p>
            <button
              type="button"
              onClick={onCerrar}
              className="mt-4 cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque"
            >
              {t('support.close')}
            </button>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={enviar}>
            <div>
              <label className={labelCls} htmlFor="soporte-nombre">{t('support.name')}</label>
              <input
                id="soporte-nombre"
                className={inputCls}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="soporte-email">{t('support.email')}</label>
              <input
                id="soporte-email"
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={150}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="soporte-asunto">{t('support.subject')}</label>
              <input
                id="soporte-asunto"
                className={inputCls}
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="soporte-mensaje">{t('support.message')}</label>
              <textarea
                id="soporte-mensaje"
                rows={5}
                className="w-full resize-none rounded-none border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                maxLength={2000}
                required
              />
            </div>

            {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCerrar}
                className="cursor-pointer rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-verde-bosque transition-colors hover:bg-crema"
              >
                {t('support.cancel')}
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque disabled:opacity-50"
              >
                {enviando ? t('support.sending') : t('support.send')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
