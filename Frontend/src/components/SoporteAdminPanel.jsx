import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDateDMY } from '../i18n/format.js'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import { cambiarEstadoSoporte, getSoportesAdmin } from '../services/soporte.js'

const ESTADOS = ['pendiente', 'en_revision', 'resuelto', 'rechazado']

const BADGE = {
  pendiente: 'bg-amber/15 text-verde-bosque',
  en_revision: 'bg-blue-100 text-blue-800',
  resuelto: 'bg-verde-hoja/20 text-verde-bosque',
  rechazado: 'bg-red-100 text-red-700',
}

export default function SoporteAdminPanel() {
  const { t } = useTranslation('admin')
  const locale = useFormatLocale()
  const [soportes, setSoportes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [seleccionado, setSeleccionado] = useState(null)
  const [estado, setEstado] = useState('pendiente')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const ref = useModalAccesible(() => setSeleccionado(null), !!seleccionado)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(false)
    try {
      const datos = await getSoportesAdmin()
      setSoportes(Array.isArray(datos) ? datos : [])
    } catch {
      setSoportes([])
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const abrir = (s) => {
    setSeleccionado(s)
    setEstado(s.estado || 'pendiente')
    setNotas(s.notasAdmin || '')
    setErrorGuardar('')
  }

  const guardar = async () => {
    setGuardando(true)
    setErrorGuardar('')
    try {
      await cambiarEstadoSoporte(seleccionado.id, { estado, notasAdmin: notas })
      setSeleccionado(null)
      await cargar()
    } catch {
      setErrorGuardar(t('support.saveError'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-6 overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-cafe-claro/30 px-4 py-4">
        <div>
          <h3 className="text-lg font-bold text-verde-bosque">{t('support.title')}</h3>
          <p className="mt-1 text-xs text-cafe">{t('support.subtitle')}</p>
        </div>
      </div>

      {cargando ? (
        <p className="px-6 py-10 text-center text-cafe">{t('support.loading')}</p>
      ) : error ? (
        <div role="alert" className="px-6 py-10 text-center">
          <p className="font-semibold text-red-700">{t('support.error')}</p>
          <button
            type="button"
            onClick={cargar}
            className="mt-4 cursor-pointer rounded-full bg-iguana-hondo px-5 py-2 text-sm font-semibold text-white hover:bg-verde-bosque"
          >
            {t('support.retry')}
          </button>
        </div>
      ) : soportes.length === 0 ? (
        <p className="px-6 py-10 text-center text-cafe">{t('support.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-verde-bosque text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('support.table.date')}</th>
                <th className="px-4 py-3 font-semibold">{t('support.table.person')}</th>
                <th className="px-4 py-3 font-semibold">{t('support.table.subject')}</th>
                <th className="px-4 py-3 font-semibold">{t('support.table.status')}</th>
                <th className="px-4 py-3 font-semibold">{t('support.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cafe-claro/30">
              {soportes.map((s) => (
                <tr key={s.id} className="hover:bg-crema">
                  <td className="px-4 py-3 text-xs text-cafe">{s.creadoEn ? formatDateDMY(s.creadoEn, locale) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-verde-bosque">{s.nombre}</span>
                    <span className="text-xs text-cafe">{s.email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-neutral-700">{s.asunto}</span>
                    <span className="line-clamp-1 text-xs text-cafe">{s.mensaje}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[s.estado] ?? 'bg-neutral-100 text-neutral-700'}`}>
                      {t(`support.status.${s.estado}`, { defaultValue: s.estado })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => abrir(s)}
                      className="cursor-pointer rounded-full bg-verde-bosque px-3 py-1 text-xs font-semibold text-white hover:bg-iguana-hondo"
                    >
                      {t('support.manage')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seleccionado && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 px-4 py-6"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSeleccionado(null) }}
        >
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="soporte-admin-titulo"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="soporte-admin-titulo" className="text-xl font-bold text-verde-bosque">
                {t('support.detailTitle', { id: seleccionado.id })}
              </h2>
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                aria-label={t('support.close')}
                className="cursor-pointer text-2xl leading-none text-cafe hover:text-verde-bosque"
              >
                &times;
              </button>
            </div>
            <div className="mt-4 space-y-1 text-sm text-neutral-700">
              <p><strong>{t('support.table.person')}:</strong> {seleccionado.nombre} ({seleccionado.email})</p>
              <p><strong>{t('support.table.subject')}:</strong> {seleccionado.asunto}</p>
              <p className="whitespace-pre-wrap pt-2">{seleccionado.mensaje}</p>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-semibold text-verde-bosque" htmlFor="soporte-estado">
                {t('support.table.status')}
              </label>
              <select
                id="soporte-estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="w-full rounded-[22px] border border-cafe-claro px-3 py-2 text-sm"
              >
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>{t(`support.status.${e}`)}</option>
                ))}
              </select>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-semibold text-verde-bosque" htmlFor="soporte-notas">
                {t('support.notes')}
              </label>
              <textarea
                id="soporte-notas"
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                className="w-full resize-none rounded-[22px] border border-cafe-claro px-3 py-2 text-sm"
              />
            </div>
            {errorGuardar && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{errorGuardar}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="flex-1 cursor-pointer rounded-full bg-iguana-hondo px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {guardando ? t('support.saving') : t('support.save')}
              </button>
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="flex-1 cursor-pointer rounded-full border border-neutral-300 px-4 py-2.5 font-semibold text-verde-bosque"
              >
                {t('support.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
