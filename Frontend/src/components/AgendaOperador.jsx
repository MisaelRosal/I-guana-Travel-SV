import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDateDMY, formatDayMonthShort, formatMonthYear, formatPrice, weekdayShortMonFirst } from '../i18n/format.js'
import { getAgenda, confirmarReserva } from '../services/reservas.js'

// A-20 (agenda del operador): a read-only month calendar plus a forward-looking
// list of every reservation behind the caller's own publications. The server
// scopes the payload by the token subject (ReservaController.GetAgenda), so this
// component never filters by host — it only offers a publication dropdown and a
// month stepper as pure view controls.

const ESTADOS = ['pendiente', 'confirmada', 'completada', 'cancelada']

const BADGE_ESTADO = {
  pendiente: 'bg-amber/15 text-verde-bosque',
  confirmada: 'bg-verde-hoja/20 text-verde-bosque',
  completada: 'bg-neutral-200 text-neutral-700',
  cancelada: 'bg-red-100 text-red-700',
}

function iso(anio, mes, dia) {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function isoAdd(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const date = new Date(y, m - 1, d + dias)
  return iso(date.getFullYear(), date.getMonth(), date.getDate())
}

// Half-open occupancy: lodging keeps [check-in, check-out) so the checkout day
// stays free; an experience is booked to a single day (mirrors the backend's
// EffectiveDates). Cancelled rows never block a day.
function diasOcupados(r) {
  if (r.estado === 'cancelada') return []
  if (r.tipo === 'experiencia') return [r.fechaInicio]
  const dias = []
  let cursor = r.fechaInicio
  while (cursor < r.fechaFin && dias.length < 3660) {
    dias.push(cursor)
    cursor = isoAdd(cursor, 1)
  }
  return dias.length > 0 ? dias : [r.fechaInicio]
}

export default function AgendaOperador({ publicaciones = [], esAdmin = false }) {
  const { t } = useTranslation('panel')
  const locale = useFormatLocale()

  const hoy = new Date()
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [publicacionId, setPublicacionId] = useState('')
  const [confirmandoId, setConfirmandoId] = useState(null)
  const [confirmErrorId, setConfirmErrorId] = useState(null)
  const [confirmError, setConfirmError] = useState(null)
  const [mesCal, setMesCal] = useState(hoy.getMonth())
  const [anioCal, setAnioCal] = useState(hoy.getFullYear())

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(false)
    try {
      setReservas(await getAgenda())
    } catch {
      setReservas([])
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const filtradas = useMemo(
    () => reservas.filter((r) => !publicacionId || String(r.publicacionId) === String(publicacionId)),
    [reservas, publicacionId],
  )

  const hoyISO = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())

  const ocupacion = useMemo(() => {
    const mapa = new Map()
    for (const r of filtradas) {
      for (const dia of diasOcupados(r)) {
        mapa.set(dia, (mapa.get(dia) ?? 0) + 1)
      }
    }
    return mapa
  }, [filtradas])

  const proximas = useMemo(
    () => filtradas.filter((r) => r.fechaFin >= hoyISO).sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio)),
    [filtradas, hoyISO],
  )
  const anteriores = useMemo(
    () => filtradas.filter((r) => r.fechaFin < hoyISO).sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)),
    [filtradas, hoyISO],
  )

  const confirmar = async (r) => {
    setConfirmErrorId(null)
    setConfirmError(null)
    setConfirmandoId(r.id)
    try {
      await confirmarReserva(r.id)
      await cargar()
    } catch (err) {
      setConfirmErrorId(r.id)
      setConfirmError(err.mensaje || err.message || t('agenda.confirmError'))
    } finally {
      setConfirmandoId(null)
    }
  }

  const cambiarMes = (delta) => {
    let m = mesCal + delta
    let a = anioCal
    if (m < 0) { m = 11; a -= 1 }
    else if (m > 11) { m = 0; a += 1 }
    setMesCal(m)
    setAnioCal(a)
  }

  const celdas = useMemo(() => {
    const primerDia = new Date(anioCal, mesCal, 1)
    const diasEnMes = new Date(anioCal, mesCal + 1, 0).getDate()
    const offset = (primerDia.getDay() + 6) % 7
    const out = []
    for (let i = 0; i < offset; i++) out.push({ dia: null })
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = iso(anioCal, mesCal, d)
      out.push({ dia: d, fecha, ocupado: ocupacion.get(fecha) ?? 0, esHoy: fecha === hoyISO })
    }
    return out
  }, [anioCal, mesCal, ocupacion, hoyISO])

  const estadoLabel = (estado) => (ESTADOS.includes(estado) ? t(`agenda.estado.${estado}`) : estado ?? '')

  const rango = (r) =>
    r.tipo === 'experiencia' || r.fechaInicio === r.fechaFin
      ? formatDateDMY(r.fechaInicio, locale)
      : `${formatDateDMY(r.fechaInicio, locale)} – ${formatDateDMY(r.fechaFin, locale)}`

  const renderFila = (r, esProxima = false) => (
    <li key={r.id} className="rounded-[22px] border border-cafe-claro/40 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-verde-bosque">{r.nombreHuesped}</p>
          <p className="truncate text-xs text-cafe">{r.publicacionTitulo}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_ESTADO[r.estado] ?? 'bg-neutral-200 text-neutral-700'}`}>
          {estadoLabel(r.estado)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-700">
        <span className="font-semibold text-verde-bosque">{rango(r)}</span>
        <span>{t('agenda.guests', { count: r.numeroHuespedes })}</span>
        <span className="font-semibold text-iguana-hondo">{formatPrice(r.precioTotal, locale)}</span>
      </div>
      {esProxima && r.estado === 'pendiente' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => confirmar(r)}
            disabled={confirmandoId !== null}
            className="cursor-pointer rounded-full bg-iguana-hondo px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-verde-bosque disabled:opacity-50"
          >
            {t('agenda.confirm')}
          </button>
          {confirmErrorId === r.id && (
            <p className="text-xs font-semibold text-red-700" role="alert">{confirmError}</p>
          )}
        </div>
      )}
    </li>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <label
            htmlFor="agenda-publicacion"
            className="mb-1 block text-xs font-semibold text-cafe"
          >
            {t('agenda.filter.label')}
          </label>
          <select
            id="agenda-publicacion"
            value={publicacionId}
            onChange={(e) => setPublicacionId(e.target.value)}
            className="min-w-[220px] cursor-pointer rounded-full border border-cafe-claro/60 bg-white px-3 py-2 text-sm font-semibold text-verde-bosque focus:border-verde-bosque focus:outline-none"
          >
            <option value="">{t('agenda.filter.all')}</option>
            {publicaciones.map((p) => (
              <option key={p.id} value={p.id}>{p.titulo}</option>
            ))}
          </select>
        </div>
        {esAdmin && <p className="text-xs italic text-cafe">{t('agenda.adminNote')}</p>}
      </div>

      {cargando ? (
        <p className="rounded-[22px] border border-cafe-claro/40 bg-white px-6 py-14 text-center text-cafe">
          {t('agenda.loading')}
        </p>
      ) : error ? (
        <p className="rounded-[22px] border border-red-200 bg-red-50 px-6 py-14 text-center font-semibold text-red-700">
          {t('agenda.error')}
        </p>
      ) : (
        <>
          <section className="rounded-[22px] border border-cafe-claro/40 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => cambiarMes(-1)}
                aria-label={t('common:calendar.prevMonth')}
                className="cursor-pointer rounded-full p-1.5 text-iguana-hondo transition-colors hover:bg-iguana-hondo/10"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <p className="text-sm font-bold text-verde-bosque">{formatMonthYear(new Date(anioCal, mesCal, 1), locale)}</p>
              <button
                type="button"
                onClick={() => cambiarMes(1)}
                aria-label={t('common:calendar.nextMonth')}
                className="cursor-pointer rounded-full p-1.5 text-iguana-hondo transition-colors hover:bg-iguana-hondo/10"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="py-1 text-center text-[11px] font-semibold uppercase text-cafe">
                  {weekdayShortMonFirst(i, locale)}
                </span>
              ))}
              {celdas.map((celda, i) => (
                <div key={i}>
                  {celda.dia ? (
                    <div
                      className={`flex h-11 flex-col items-center justify-center rounded-full text-sm font-semibold ${
                        celda.ocupado > 0
                          ? 'bg-iguana-hondo/90 text-white'
                          : celda.esHoy
                            ? 'border border-iguana-hondo text-iguana-hondo'
                            : 'text-neutral-700'
                      }`}
                      title={celda.ocupado > 0 ? t('agenda.dayOccupied', { count: celda.ocupado }) : undefined}
                    >
                      <span>{celda.dia}</span>
                      {celda.ocupado > 0 && <span className="text-[10px] font-bold">{celda.ocupado}</span>}
                    </div>
                  ) : (
                    <span className="block h-11" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-xs text-cafe">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-iguana-hondo/90" aria-hidden="true" />
                {t('agenda.legend.occupied')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border border-iguana-hondo" aria-hidden="true" />
                {t('agenda.legend.today')}
              </span>
            </div>
          </section>

          {filtradas.length === 0 ? (
            <div className="rounded-[22px] border border-cafe-claro/40 bg-white px-6 py-14 text-center">
              <p className="text-lg font-semibold text-verde-bosque">{t('agenda.emptyTitle')}</p>
              <p className="mt-1 text-sm text-cafe">{t('agenda.emptyBody')}</p>
            </div>
          ) : (
            <>
              <section>
                <h3 className="mb-3 text-sm font-bold text-verde-bosque">{t('agenda.upcomingTitle')}</h3>
                {proximas.length === 0 ? (
                  <p className="rounded-[22px] border border-dashed border-cafe-claro bg-white px-4 py-6 text-center text-sm text-cafe">
                    {t('agenda.upcomingEmpty')}
                  </p>
                ) : (
                  <ul className="space-y-3">{proximas.map((r) => renderFila(r, true))}</ul>
                )}
              </section>

              {anteriores.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-bold text-cafe">{t('agenda.pastTitle')}</h3>
                  <ul className="space-y-3 opacity-70">{anteriores.map(renderFila)}</ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
