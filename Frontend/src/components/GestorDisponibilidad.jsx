import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDateDMY } from '../i18n/format.js'
import { api } from '../services/api.js'

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40'

function horariosConFecha(publicacion) {
  return (publicacion?.horarios ?? [])
    .filter((h) => h.fecha)
    .slice()
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
}

function horaCorta(hora) {
  return hora ? String(hora).slice(0, 5) : ''
}

export default function GestorDisponibilidad({ publicaciones = [], onActualizado, onMensaje }) {
  const { t } = useTranslation('panel')
  const locale = useFormatLocale()

  const experiencias = useMemo(
    () => publicaciones.filter((p) => horariosConFecha(p).length > 0),
    [publicaciones],
  )

  const [pubId, setPubId] = useState(null)
  const [ediciones, setEdiciones] = useState({})
  const [guardandoId, setGuardandoId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (experiencias.length === 0) {
      setPubId(null)
      return
    }
    setPubId((prev) => (experiencias.some((p) => p.id === prev) ? prev : experiencias[0].id))
  }, [experiencias])

  useEffect(() => {
    setEdiciones({})
    setError(null)
  }, [pubId])

  if (experiencias.length === 0) {
    return (
      <div className="rounded-xl border border-cafe-claro/40 bg-white px-6 py-14 text-center shadow-sm">
        <p className="text-lg font-semibold text-verde-bosque">{t('availability.emptyTitle')}</p>
        <p className="mt-1 text-sm text-cafe">{t('availability.emptyBody')}</p>
      </div>
    )
  }

  const publicacion = experiencias.find((p) => p.id === pubId) ?? experiencias[0]
  const horarios = horariosConFecha(publicacion)

  const valor = (h) => ediciones[h.id] ?? {
    cupos: h.cupos != null ? String(h.cupos) : '',
    disponible: h.disponible !== false,
  }

  const actualizar = (h, cambios) => {
    setEdiciones((prev) => ({ ...prev, [h.id]: { ...valor(h), ...cambios } }))
  }

  const cambio = (h) => {
    const v = valor(h)
    const cuposOriginal = h.cupos != null ? String(h.cupos) : ''
    return v.cupos !== cuposOriginal || v.disponible !== (h.disponible !== false)
  }

  const guardar = async (h) => {
    const v = valor(h)
    setGuardandoId(h.id)
    setError(null)
    try {
      await api.put(`/Horario/${h.id}`, {
        publicacionId: h.publicacionId ?? publicacion.id,
        diaSemana: h.diaSemana ?? null,
        fecha: h.fecha,
        horaInicio: h.horaInicio,
        horaFin: h.horaFin,
        disponible: v.disponible,
        cupos: v.cupos === '' ? null : parseInt(v.cupos, 10),
      })
      onMensaje?.(t('availability.saved'))
      onActualizado?.()
    } catch (e) {
      setError(e?.mensaje || e?.message || t('availability.error'))
    } finally {
      setGuardandoId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-cafe-claro/40 bg-white p-4 shadow-sm sm:p-5">
        <label className="block text-sm font-semibold text-cafe-oscuro mb-1" htmlFor="gestor-publicacion">
          {t('availability.selectLabel')}
        </label>
        <select
          id="gestor-publicacion"
          value={publicacion.id}
          onChange={(e) => setPubId(Number(e.target.value))}
          className={inputCls}
        >
          {experiencias.map((p) => (
            <option key={p.id} value={p.id}>{p.titulo}</option>
          ))}
        </select>
        <p className="mt-2 text-xs text-cafe">{t('availability.hint')}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-cafe-claro/40 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-verde-bosque text-white">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('availability.table.date')}</th>
                <th className="px-4 py-3 font-semibold">{t('availability.table.time')}</th>
                <th className="px-4 py-3 font-semibold">{t('availability.table.slots')}</th>
                <th className="px-4 py-3 font-semibold">{t('availability.table.available')}</th>
                <th className="px-4 py-3 font-semibold">{t('availability.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cafe-claro/30">
              {horarios.map((h) => {
                const v = valor(h)
                const dirty = cambio(h)
                return (
                  <tr key={h.id} className={v.disponible ? '' : 'bg-red-50/50'}>
                    <td className="px-4 py-3 font-semibold text-verde-bosque">{formatDateDMY(h.fecha, locale)}</td>
                    <td className="px-4 py-3 text-neutral-700">{horaCorta(h.horaInicio)} – {horaCorta(h.horaFin)}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        value={v.cupos}
                        onChange={(e) => actualizar(h, { cupos: e.target.value })}
                        aria-label={t('availability.table.slots')}
                        className="w-24 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={v.disponible}
                          onChange={(e) => actualizar(h, { disponible: e.target.checked })}
                          className="accent-verde-bosque"
                        />
                        <span className={v.disponible ? 'text-verde-bosque' : 'text-red-600'}>
                          {v.disponible ? t('availability.available') : t('availability.blocked')}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => guardar(h)}
                        disabled={!dirty || guardandoId === h.id}
                        className="cursor-pointer rounded-lg bg-terracota px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-verde-bosque disabled:opacity-40"
                      >
                        {guardandoId === h.id ? t('availability.saving') : t('availability.save')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
