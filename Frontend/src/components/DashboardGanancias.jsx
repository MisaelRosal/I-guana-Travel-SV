import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDayMonthShort, formatMonthLong, formatPrice } from '../i18n/format.js'
import { getGanancias } from '../services/dashboard.js'

// Día = last 14 daily buckets, Semana = last 12 ISO weeks, Mes = last 12 months
// (mirrors DashboardController). The period + publication filters re-query the
// server; every figure below comes from the same simulated-earnings response.
const PERIODOS = ['dia', 'semana', 'mes']

export default function DashboardGanancias({
  publicaciones = [],
  esAdmin = false,
  totalResenas,
  onVerPublicaciones,
  onVerResenas,
  onCrearPublicacion,
}) {
  const { t } = useTranslation('panel')
  const locale = useFormatLocale()
  const [periodo, setPeriodo] = useState('mes')
  const [publicacionId, setPublicacionId] = useState('')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(false)
    try {
      const data = await getGanancias({ periodo, publicacionId })
      // Defensive: a mocked/empty payload ([]) degrades to the empty state.
      setDatos(data && !Array.isArray(data) ? data : null)
    } catch {
      setDatos(null)
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [periodo, publicacionId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const series = datos?.series ?? []
  const porPublicacion = datos?.porPublicacion ?? []
  const maxSeries = series.reduce((max, s) => Math.max(max, Number(s.total)), 0) || 1
  const hayGanancias = (datos?.total ?? 0) > 0

  const etiquetaBucket = (inicio) =>
    periodo === 'mes' ? formatMonthLong(inicio, locale) : formatDayMonthShort(inicio, locale)

  const tipoLabel = (tipo) => t(`dashboard.type.${tipo}`, { defaultValue: tipo })

  // Shortcuts to the operator's remaining tools (A-19): each is rendered only
  // when the parent wires its handler, so the dashboard stays usable in
  // isolation (tests, admin preview) without dangling buttons.
  const accesos = [
    onCrearPublicacion && {
      key: 'create',
      etiqueta: t('dashboard.shortcuts.create'),
      onClick: onCrearPublicacion,
      icono: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    onVerPublicaciones && {
      key: 'publications',
      etiqueta: t('dashboard.shortcuts.publications'),
      onClick: onVerPublicaciones,
      contador: publicaciones.length,
      icono: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      ),
    },
    onVerResenas && {
      key: 'reviews',
      etiqueta: t('dashboard.shortcuts.reviews'),
      onClick: onVerResenas,
      contador: totalResenas,
      icono: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9L12 3z" />
        </svg>
      ),
    },
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <span className="mb-1 block text-xs font-semibold text-cafe">
              {t('dashboard.period.label')}
            </span>
            <div className="inline-flex rounded-full border border-cafe-claro/60 bg-white p-0.5">
              {PERIODOS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodo(p)}
                  aria-pressed={periodo === p}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    periodo === p
                      ? 'bg-iguana-hondo text-white'
                      : 'text-cafe hover:text-verde-bosque'
                  }`}
                >
                  {t(`dashboard.period.${p}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="dashboard-publicacion"
              className="mb-1 block text-xs font-semibold text-cafe"
            >
              {t('dashboard.publication.label')}
            </label>
            <select
              id="dashboard-publicacion"
              value={publicacionId}
              onChange={(e) => setPublicacionId(e.target.value)}
              className="min-w-[220px] cursor-pointer rounded-full border border-cafe-claro/60 bg-white px-3 py-2 text-sm font-semibold text-verde-bosque focus:border-verde-bosque focus:outline-none"
            >
              <option value="">{t('dashboard.publication.all')}</option>
              {publicaciones.map((p) => (
                <option key={p.id} value={p.id}>{p.titulo}</option>
              ))}
            </select>
          </div>
        </div>

        {esAdmin && (
          <p className="text-xs italic text-cafe">{t('dashboard.adminNote')}</p>
        )}
      </div>

      {accesos.length > 0 && (
        <section className="rounded-[22px] border border-cafe-claro/40 bg-white p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-bold text-verde-bosque">{t('dashboard.shortcuts.title')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {accesos.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={a.onClick}
                className="group flex cursor-pointer items-center gap-3 rounded-[22px] border border-cafe-claro/50 bg-crema/30 px-4 py-3 text-left transition-colors hover:border-iguana-hondo/50 hover:bg-crema"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iguana-hondo/10 text-iguana-hondo transition-colors group-hover:bg-iguana-hondo group-hover:text-white">
                  {a.icono}
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-verde-bosque">
                  {a.etiqueta}
                </span>
                {a.contador != null && (
                  <span className="shrink-0 rounded-full bg-verde-hoja/15 px-2 py-0.5 text-xs font-bold text-verde-bosque">
                    {a.contador}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {cargando ? (
        <p className="rounded-[22px] border border-cafe-claro/40 bg-white px-6 py-14 text-center text-cafe">
          {t('dashboard.loading')}
        </p>
      ) : error ? (
        <p className="rounded-[22px] border border-red-200 bg-red-50 px-6 py-14 text-center font-semibold text-red-700">
          {t('dashboard.error')}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tarjeta
              etiqueta={t('dashboard.card.total')}
              valor={formatPrice(datos.total, locale)}
              destacada
            />
            <Tarjeta
              etiqueta={t('dashboard.card.reservas')}
              valor={datos.totalReservas}
            />
            <Tarjeta
              etiqueta={t('dashboard.card.promedio')}
              valor={formatPrice(datos.promedio, locale)}
            />
            <Tarjeta
              etiqueta={t('dashboard.card.general')}
              valor={formatPrice(datos.totalGeneral, locale)}
            />
          </div>

          <div className="rounded-[22px] border border-cafe-claro/40 bg-white p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-bold text-verde-bosque">{t('dashboard.chart.title')}</h3>
            {hayGanancias ? (
              <div className="flex h-44 items-end gap-1.5" role="img" aria-label={t('dashboard.chart.title')}>
                {series.map((s) => (
                  <div key={s.inicio} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="w-full rounded-t bg-iguana-hondo/85 transition-colors hover:bg-iguana-hondo"
                      style={{ height: `${Math.max((Number(s.total) / maxSeries) * 100, Number(s.total) > 0 ? 3 : 0)}%` }}
                      title={`${formatPrice(s.total, locale)} · ${t('dashboard.chart.tooltip', { count: s.reservas })}`}
                    />
                    <span className="w-full truncate text-center text-[10px] text-cafe">
                      {etiquetaBucket(s.inicio)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-cafe">{t('dashboard.chart.empty')}</p>
            )}
          </div>

          <div className="overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
            <h3 className="border-b border-cafe-claro/30 px-4 py-3 text-sm font-bold text-verde-bosque sm:px-5">
              {t('dashboard.table.title')}
            </h3>
            {porPublicacion.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-cafe">{t('dashboard.table.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-crema/70 text-xs text-cafe">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold sm:px-5">{t('dashboard.table.listing')}</th>
                      <th className="px-4 py-2.5 font-semibold sm:px-5">{t('dashboard.table.type')}</th>
                      <th className="px-4 py-2.5 text-right font-semibold sm:px-5">{t('dashboard.table.reservas')}</th>
                      <th className="px-4 py-2.5 text-right font-semibold sm:px-5">{t('dashboard.table.total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cafe-claro/30">
                    {porPublicacion.map((p) => (
                      <tr key={p.publicacionId} className="transition-colors hover:bg-crema">
                        <td className="px-4 py-3 font-semibold text-verde-bosque sm:px-5">{p.titulo}</td>
                        <td className="px-4 py-3 text-neutral-700 sm:px-5">{tipoLabel(p.tipo)}</td>
                        <td className="px-4 py-3 text-right text-neutral-700 sm:px-5">{p.reservas}</td>
                        <td className="px-4 py-3 text-right font-semibold text-iguana-hondo sm:px-5">
                          {formatPrice(p.total, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Tarjeta({ etiqueta, valor, destacada = false }) {
  return (
    <div className={`rounded-[22px] border p-4 ${destacada ? 'border-iguana-hondo/40 bg-iguana-hondo/5' : 'border-cafe-claro/40 bg-white'}`}>
      <p className="text-xs font-semibold text-cafe">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-bold ${destacada ? 'text-iguana-hondo' : 'text-verde-bosque'}`}>{valor}</p>
    </div>
  )
}
