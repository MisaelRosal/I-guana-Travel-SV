import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDateDMY } from '../i18n/format.js'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import { crearResenaHuesped } from '../services/reservas.js'
import { SelectorEstrellas } from '../components/Estrellas.jsx'

export default function ModalResenaHuesped({ reserva, onCerrar, onExito }) {
  const { t } = useTranslation('reservas')
  const locale = useFormatLocale()
  const refDialogo = useModalAccesible(onCerrar)
  const [calificacion, setCalificacion] = useState(0)
  const [comentario, setComentario] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)

  const etiquetas = [0, 1, 2, 3, 4, 5].map((n) => t(`reviews.rating.${n}`))

  const handleEnviar = async () => {
    setProcesando(true)
    setError(null)
    try {
      const resena = await crearResenaHuesped({
        reservaId: reserva.id,
        calificacion,
        comentario,
      })
      onExito(resena)
    } catch (err) {
      setError(err.mensaje || err.message || t('reviews.error'))
      setProcesando(false)
    }
  }

  return (
    <div
      ref={refDialogo}
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resena-huesped-titulo"
    >
      <div className="animate-modal-box w-full max-w-md rounded-[22px] bg-white p-6 ring-1 ring-black/5">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="resena-huesped-titulo" className="text-xl font-bold text-iguana-hondo">
              {t('reviews.rateGuestTitle')}
            </h2>
            <p className="mt-0.5 text-sm text-cafe">
              {reserva.nombreHuesped} · {formatDateDMY(reserva.fechaInicio, locale)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            aria-label={t('common:modal.close')}
            className="text-2xl leading-none text-cafe hover:text-iguana-hondo transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="mb-5 rounded-[22px] bg-crema p-4">
          <p className="text-xs font-semibold text-cafe">{t('card.categoryLabel', { categoria: reserva.experienciaCategoria })}</p>
          <p className="mt-0.5 text-sm font-bold text-verde-bosque">{reserva.experienciaTitulo}</p>
          <p className="mt-0.5 text-xs text-cafe">
            {formatDateDMY(reserva.fechaInicio, locale)}
            {reserva.fechaFin && reserva.fechaFin !== reserva.fechaInicio ? ` → ${formatDateDMY(reserva.fechaFin, locale)}` : ''}
          </p>
        </div>

        <div className="mb-5">
          <p className="mb-2 text-sm font-semibold text-verde-bosque">{t('reviews.rateGuestQuestion')}</p>
          <div className="flex items-center gap-3">
            <SelectorEstrellas valor={calificacion} onChange={setCalificacion} />
            <span className="text-sm font-semibold text-amber">{etiquetas[calificacion]}</span>
          </div>
        </div>

        <div className="mb-5">
          <label htmlFor="comentario-resena-huesped" className="mb-1 block text-sm font-semibold text-verde-bosque">
            {t('reviews.commentLabel')} <span className="font-normal text-cafe">{t('reviews.commentOptional')}</span>
          </label>
          <textarea
            id="comentario-resena-huesped"
            rows={4}
            maxLength={500}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={t('reviews.commentPlaceholder')}
            className="w-full resize-none rounded-[22px] border border-cafe-claro px-3 py-2 text-sm text-neutral-800 focus:border-verde-bosque focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-cafe">{comentario.length}/500</p>
        </div>

        {error && (
          <p className="mb-4 rounded-[22px] bg-red-50 p-2 text-center text-sm text-red-700">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleEnviar}
            disabled={procesando}
            className="flex-1 cursor-pointer rounded-full bg-iguana-hondo px-4 py-3 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
          >
            {procesando ? t('reviews.submitting') : t('reviews.submit')}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="flex-1 cursor-pointer rounded-full border border-neutral-300 px-4 py-3 font-semibold text-verde-bosque hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            {t('common:actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
