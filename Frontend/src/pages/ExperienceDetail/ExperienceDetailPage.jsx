import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { getContentLocale, useFormatLocale } from '../../i18n/config.js'
import { localePath } from '../../i18n/routes.jsx'
import {
  formatDateDMY,
  formatDayMonthShort,
  formatMonthLong,
  formatMonthYear,
  formatPrice,
  weekdayLong,
  weekdayShortMonFirst,
} from '../../i18n/format.js'
import { getExperienciaById } from '../../services/experiencias'
import { getDisponibilidad } from '../../services/reservas'
import { getResenasPublicacion } from '../../services/resenas'
import { leerSesionCache } from '../../services/session.js'
import { scrollBehavior } from '../../utils/motion.js'
import FormularioReserva from '../../components/FormularioReserva'
import ChatPanel from '../../components/ChatPanel'
import { useModalAccesible } from '../../hooks/useModalAccesible.js'
import Toast from '../../components/Toast.jsx'
import { Estrellas } from '../../components/Estrellas.jsx'

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function Galeria({ imagenes, titulo }) {
  const { t } = useTranslation('experiencia')
  const [indice, setIndice] = useState(0)
  const [ampliada, setAmpliada] = useState(false)
  const primera = imagenes[0]

  // Lightbox: foco, atrapado de Tab y cierre con Escape (hook compartido).
  const refDialogo = useModalAccesible(() => setAmpliada(false), ampliada)

  return (
    <div>
      <div className="relative h-[min(60vw,420px)] max-sm:h-[320px] overflow-hidden rounded-[22px] bg-neutral-100">
        {primera ? (
          <>
            <img
              src={imagenes[indice % imagenes.length]}
              alt={titulo}
              title={t('gallery.zoomTitle')}
              onClick={() => setAmpliada(true)}
              className="h-full w-full cursor-zoom-in object-cover"
            />
            {imagenes.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setIndice((indice - 1 + imagenes.length) % imagenes.length)}
                  aria-label={t('gallery.prev')}
                  className="absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setIndice((indice + 1) % imagenes.length)}
                  aria-label={t('gallery.next')}
                  className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  ›
                </button>
                <span className="absolute right-3 bottom-3 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                  {indice + 1} / {imagenes.length}
                </span>
              </>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-cafe">{t('gallery.noImages')}</div>
        )}
      </div>

      {imagenes.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {imagenes.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setIndice(i); setAmpliada(true) }}
              aria-label={t('gallery.viewLarge', { n: i + 1 })}
              className={`cursor-pointer overflow-hidden rounded-[22px] border-2 ${i === indice ? 'border-iguana-hondo' : 'border-transparent'}`}
            >
              <img src={img} alt={`${titulo} ${i + 1}`} className="aspect-[16/10] w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Vista ampliada (lightbox): la imagen seleccionada en grande sobre fondo oscuro */}
      {ampliada && primera && (
        <div
          ref={refDialogo}
          role="dialog"
          aria-modal="true"
          aria-label={t('gallery.expandedAria', { title: titulo })}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setAmpliada(false)}
        >
          <button
            type="button"
            aria-label={t('gallery.close')}
            onClick={() => setAmpliada(false)}
            className="absolute top-4 right-4 cursor-pointer rounded-full bg-white/10 px-3.5 py-1.5 text-xl leading-none text-white hover:bg-white/25"
          >
            ✕
          </button>
          {imagenes.length > 1 && (
            <button
              type="button"
              aria-label={t('gallery.prev')}
              onClick={(e) => { e.stopPropagation(); setIndice((indice - 1 + imagenes.length) % imagenes.length) }}
              className="absolute left-3 cursor-pointer rounded-full bg-white/10 p-3 text-2xl leading-none text-white hover:bg-white/25 sm:left-6"
            >
              ‹
            </button>
          )}
          <img
            src={imagenes[indice % imagenes.length]}
            alt={titulo}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] rounded-[22px] object-contain"
          />
          {imagenes.length > 1 && (
            <button
              type="button"
              aria-label={t('gallery.next')}
              onClick={(e) => { e.stopPropagation(); setIndice((indice + 1) % imagenes.length) }}
              className="absolute right-3 cursor-pointer rounded-full bg-white/10 p-3 text-2xl leading-none text-white hover:bg-white/25 sm:right-6"
            >
              ›
            </button>
          )}
          {imagenes.length > 1 && (
            <span className="absolute bottom-4 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
              {indice + 1} / {imagenes.length}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function InfoBox({ experiencia, onReservar, resumenResenas, esMiPublicacion }) {
  const { t } = useTranslation('experiencia')
  const locale = useFormatLocale()
  const esHospedaje = experiencia.tipo === 'hospedaje'
  // Slash stays an inline glyph so the ES render remains byte-comparable.
  const unidad = esHospedaje ? t('card.perNight') : t('card.perPerson')

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-iguana-hondo">{experiencia.categoria}</p>
          <h2 className="mt-1 text-3xl font-bold leading-tight text-verde-bosque">{experiencia.titulo}</h2>
          {resumenResenas && (
            <div className="mt-1.5 flex items-center gap-1.5 text-sm">
              {resumenResenas.total > 0 ? (
                <>
                  <Estrellas valor={resumenResenas.promedio} className="h-4 w-4" />
                  <span className="font-bold text-neutral-800">{resumenResenas.promedio.toFixed(1)}</span>
                  <span className="text-cafe">
                    · {t('reviews.count', { count: resumenResenas.total })}
                  </span>
                </>
              ) : (
                <span className="italic text-cafe">{t('reviews.empty')}</span>
              )}
            </div>
          )}
          <p className="mt-2 flex items-center gap-1 text-base text-neutral-600">
            <svg className="h-5 w-5 text-iguana-hondo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {experiencia.municipio}, {experiencia.departamento}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-1.5 border-b border-neutral-100 pb-5">
        <span className="text-4xl font-extrabold text-iguana-hondo">{formatPrice(experiencia.precio, locale)}</span>
        <span className="text-lg font-medium text-neutral-600"> /{unidad}</span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
        {esHospedaje ? (
          <>
            <div>
              <dt className="text-xs font-semibold text-cafe">{t('info.capacity')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{t('info.guests', { count: experiencia.capacidad })}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-cafe">{t('info.rooms')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.habitaciones || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-cafe">{t('info.beds')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.camas || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-cafe">{t('info.baths')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.banos || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-cafe">{t('info.checkIn')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.horaEntrada || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-cafe">{t('info.checkOut')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.horaSalida || '—'}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-xs font-semibold text-cafe">{t('info.cupos')}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{t('info.persons', { count: experiencia.capacidad })}</dd>
          </div>
        )}
        {experiencia.anfitrion && (
          <div>
            <dt className="text-xs font-semibold text-cafe">{t('info.host')}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.anfitrion}</dd>
          </div>
        )}
        {experiencia.direccion && (
          <div className="col-span-2">
            <dt className="text-xs font-semibold text-cafe">{t('info.address')}</dt>
            <dd className="mt-0.5 text-base text-neutral-700">{experiencia.direccion}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-semibold text-cafe">{t('info.status')}</dt>
          <dd className="mt-0.5 text-lg font-semibold text-verde-bosque capitalize">{experiencia.estado}</dd>
        </div>
      </dl>

      {esMiPublicacion ? (
        <p className="mt-7 block w-full rounded-full bg-crema px-4 py-4 text-center text-base font-semibold text-cafe">
          {t('info.ownListing')}
        </p>
      ) : (
        <button
          type="button"
          onClick={onReservar}
          className="mt-7 block w-full cursor-pointer rounded-full bg-iguana-hondo px-4 py-4 text-center text-lg font-bold text-white transition-colors hover:bg-verde-bosque"
        >
          {t('info.bookNow')}
        </button>
      )}

      <button
        type="button"
        onClick={() => document.getElementById('ubicacion')?.scrollIntoView({ behavior: scrollBehavior() })}
        className="mt-3 block w-full cursor-pointer text-center font-medium text-azul transition-colors hover:text-verde-hoja"
      >
        {t('info.howToArrive')}
      </button>
    </div>
  )
}

function SeccionResenas({ data }) {
  const { t } = useTranslation('experiencia')
  const locale = useFormatLocale()
  if (!data) return null
  const { promedio, total, resenas } = data

  return (
    <section className="mt-8 border-t border-neutral-100 pt-8">
      <h3 className="text-2xl font-bold text-verde-bosque">{t('reviews.title')}</h3>

      {total > 0 ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Estrellas valor={promedio} className="h-5 w-5" />
            <span className="text-lg font-bold text-neutral-800">{Number(promedio).toFixed(1)}</span>
            <span className="text-sm text-cafe">
              · {t('reviews.count', { count: total })}
            </span>
          </div>

          <ul className="mt-5 space-y-5">
            {resenas.map((r) => (
              <li key={r.id} className="rounded-[22px] border border-neutral-100 bg-white p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crema text-sm font-bold text-cafe">
                      {(r.hueped || '').charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-verde-bosque">{r.hueped}</p>
                      <p className="text-xs text-cafe">{formatDateDMY(r.fecha, locale)}</p>
                    </div>
                  </div>
                  <Estrellas valor={r.calificacion} className="h-4 w-4" />
                </div>

                {r.comentario && (
                  <p className="mt-3 text-sm leading-relaxed text-neutral-800">{r.comentario}</p>
                )}

                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-verde-hoja/15 px-2 py-0.5 text-xs font-semibold text-verde-bosque">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {t('reviews.verified')}
                </span>

                {r.respuestaAnfitrion && (
                  <div className="mt-3 rounded-[22px] bg-crema p-3">
                    <p className="text-xs font-bold text-iguana-hondo">{t('reviews.hostReply')}</p>
                    <p className="mt-1 text-sm text-neutral-800">{r.respuestaAnfitrion}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-4 rounded-[22px] border border-dashed border-cafe-claro bg-crema/40 p-6 text-center">
          <p className="font-semibold text-verde-bosque">{t('reviews.empty')}</p>
          <p className="mt-1 text-sm text-cafe">{t('reviews.emptyHint')}</p>
        </div>
      )}
    </section>
  )
}

function CardAnfitrion({ anfitrionId, nombre, foto, descripcion, verificado, onContactar }) {
  const { t } = useTranslation('experiencia')
  const { t: tc } = useTranslation('chat')
  const location = useLocation()
  if (!anfitrionId) return null
  const sesion = leerSesionCache()
  return (
    <section className="mt-8 border-t border-neutral-100 pt-8">
      <h3 className="text-2xl font-bold text-verde-bosque">{t('host.title')}</h3>
      <Link
        to={localePath('hostProfile', { id: anfitrionId })}
        className="mt-4 flex items-start gap-4 rounded-[22px] p-1 transition-colors hover:bg-neutral-50"
      >
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-crema text-2xl font-bold text-cafe">
          {foto ? (
            <img src={foto} alt={t('host.photoAlt')} className="h-full w-full object-cover" />
          ) : (
            (nombre || '').charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-verde-bosque">{nombre}</span>
            {verificado && (
              <span className="inline-flex items-center gap-1 rounded-full bg-verde-hoja/15 px-2 py-0.5 text-xs font-semibold text-verde-bosque">
                {t('host.verified')}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-neutral-700">
            {descripcion || t('host.noDescription')}
          </p>
          <span className="mt-2 inline-block font-medium text-azul hover:text-verde-hoja">
            {t('host.fullProfile')}
          </span>
        </div>
      </Link>
      {/* Chat entry (spec THM8): opens the drawer bound to this host with the
          listing card; signed-out users get the login link, same pattern as
          the booking form. */}
      <div className="mt-4">
        {sesion ? (
          <button
            type="button"
            onClick={onContactar}
            className="cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-verde-bosque"
          >
            {tc('entry.messageHost')}
          </button>
        ) : (
          <Link
            to={localePath('login')}
            state={{ from: location.pathname + location.search }}
            className="inline-block cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-verde-bosque"
          >
            {tc('entry.messageHost')}
          </Link>
        )}
      </div>
    </section>
  )
}

function Horarios({ horarios = [] }) {
  const { t } = useTranslation('experiencia')
  const locale = useFormatLocale()
  if (!Array.isArray(horarios) || horarios.length === 0) return null

  const conFecha = horarios
    .filter((h) => h && h.fecha && h.disponible !== false && h.disponible !== 0)
    .slice()
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))

  const porDiaSemana = horarios.filter((h) => h && !h.fecha && h.diaSemana != null)

  if (conFecha.length > 0) {
    const rango = (h) => `${String(h.horaInicio || '').slice(0, 5)} – ${String(h.horaFin || '').slice(0, 5)}`
    return (
      <section className="mt-8 border-t border-neutral-100 pt-8">
        <h3 className="text-2xl font-bold text-verde-bosque">{t('schedule.datesTitle')}</h3>
        <p className="mt-1 text-sm text-cafe">{t('schedule.datesHint')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {conFecha.map((h, i) => (
            <div key={i} className="min-w-24 rounded-[22px] bg-crema px-4 py-2">
              <p className="text-sm font-bold capitalize text-verde-bosque">{formatDayMonthShort(h.fecha, locale)}</p>
              <p className="text-xs font-medium text-cafe">{rango(h)}</p>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (porDiaSemana.length === 0) return null

  const dias = [...new Set(porDiaSemana.map((h) => h.diaSemana))].sort()
  return (
    <section className="mt-8 border-t border-neutral-100 pt-8">
      <h3 className="text-2xl font-bold text-verde-bosque">{t('schedule.weeklyTitle')}</h3>
      <div className="mt-4 flex flex-wrap gap-3">
        {dias.map((dia) => {
          const hs = porDiaSemana.filter((h) => h.diaSemana === dia)
          return (
            <div key={dia} className="min-w-28 rounded-[22px] bg-crema px-5 py-3">
              <p className="text-base font-bold text-verde-bosque">{weekdayLong(dia, locale)}</p>
              <p className="mt-0.5 text-sm font-medium text-cafe">
                {hs.map((h) => `${h.horaInicio.slice(0, 5)} – ${h.horaFin.slice(0, 5)}`).join(' · ')}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Mapa({ latitud, longitud }) {
  const { t } = useTranslation('experiencia')
  const posicion = latitud && longitud ? [parseFloat(latitud), parseFloat(longitud)] : null
  return (
    <section id="ubicacion" className="mt-8 border-t border-neutral-100 pt-8">
      <h3 className="text-2xl font-bold text-verde-bosque">{t('map.title')}</h3>
      <div className="mt-4 overflow-hidden rounded-[22px] border border-neutral-200">
        <MapContainer
          center={posicion || [13.7, -89.2]}
          zoom={posicion ? 14 : 9}
          style={{ height: '380px', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {posicion && <Marker position={posicion} icon={markerIcon} />}
        </MapContainer>
      </div>
    </section>
  )
}

function CalendarioReserva({ experiencia, esHospedaje, onSeleccionarFechas, onCerrar }) {
  const { t } = useTranslation('experiencia')
  const locale = useFormatLocale()
  const refDialogo = useModalAccesible(onCerrar)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const [mes, setMes] = useState(() => hoy.getMonth())
  const [anio, setAnio] = useState(() => hoy.getFullYear())
  const [fechaInicio, setFechaInicio] = useState(null)
  const [fechaFin, setFechaFin] = useState(null)
  const [paso, setPaso] = useState('personas')
  const [numPersonas, setNumPersonas] = useState(1)
  const [fechasOcupadas, setFechasOcupadas] = useState([])
  const [cargandoFechas, setCargandoFechas] = useState(true)

  useEffect(() => {
    let activo = true
    getDisponibilidad(experiencia.id)
      .then((data) => {
        if (activo) setFechasOcupadas(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (activo) setFechasOcupadas([])
      })
      .finally(() => {
        if (activo) setCargandoFechas(false)
      })
    return () => { activo = false }
  }, [experiencia.id])

  // F4 (AD-4): month/weekday labels come from the active-locale Intl helpers.
  const primerDia = new Date(anio, mes, 1)
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const offset = (primerDia.getDay() + 6) % 7

  const cambiarMes = (delta) => {
    let nuevoMes = mes + delta
    let nuevoAnio = anio
    if (nuevoMes < 0) { nuevoMes = 11; nuevoAnio -= 1 }
    else if (nuevoMes > 11) { nuevoMes = 0; nuevoAnio += 1 }
    setMes(nuevoMes)
    setAnio(nuevoAnio)
  }

  const esHoy = (dia) => new Date(anio, mes, dia).getTime() === hoy.getTime()
  const esPasado = (dia) => new Date(anio, mes, dia).getTime() < hoy.getTime()

  const fechaStr = (dia) => {
    const d = new Date(anio, mes, dia)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const estaOcupado = (dia) => {
    const fStr = fechaStr(dia)
    return fechasOcupadas.some((r) => fStr >= r.inicio && fStr <= r.fin)
  }

  // Fechas que el anfitrion marco como disponibles (solo experiencias)
  const fechasDisponibles = experiencia.fechasDisponibles ?? []
  const aplicaFechas = !esHospedaje && fechasDisponibles.length > 0
  const estaDisponible = (dia) => !aplicaFechas || fechasDisponibles.includes(fechaStr(dia))

  const seleccionarDia = (dia) => {
    if (estaOcupado(dia) || !estaDisponible(dia)) return
    const fecha = new Date(anio, mes, dia)
    if (!esHospedaje) {
      setFechaInicio(fecha)
      setFechaFin(null)
      return
    }
    // Hospedaje: si no hay inicio, o ya hay un rango completo, reiniciamos con la llegada
    if (!fechaInicio || fechaFin) {
      setFechaInicio(fecha)
      setFechaFin(null)
      return
    }
    // Si elige un día menor o igual a la llegada, reasignamos la llegada
    if (fecha.getTime() <= fechaInicio.getTime()) {
      setFechaInicio(fecha)
      setFechaFin(null)
      return
    }
    // Validar que todo el rango del llegada->salida esté libre
    const fStr = fechaStr(dia)
    const inicioStr = `${fechaInicio.getFullYear()}-${String(fechaInicio.getMonth() + 1).padStart(2, '0')}-${String(fechaInicio.getDate()).padStart(2, '0')}`
    const rangoOk = fechasOcupadas.every((r) => r.inicio > fStr || r.fin < inicioStr)
    if (!rangoOk) return
    setFechaFin(fecha)
  }

  const estaEnRango = (dia) => {
    if (!fechaInicio || !fechaFin) return false
    const f = new Date(anio, mes, dia)
    return f.getTime() >= fechaInicio.getTime() && f.getTime() <= fechaFin.getTime()
  }
  const esExtremoInicio = (dia) => {
    if (!fechaInicio) return false
    return new Date(anio, mes, dia).getTime() === fechaInicio.getTime()
  }
  const esExtremoFin = (dia) => {
    if (!esHospedaje || !fechaFin) return false
    return new Date(anio, mes, dia).getTime() === fechaFin.getTime()
  }

  const textoSeleccion = () => {
    if (esHospedaje) {
      if (fechaInicio && fechaFin) {
        return t('calendar.rangeSelection', {
          from: fechaInicio.getDate(),
          to: fechaFin.getDate(),
          month: formatMonthLong(fechaFin, locale),
        })
      }
      if (fechaInicio) {
        return t('calendar.startHint', {
          day: fechaInicio.getDate(),
          month: formatMonthLong(fechaInicio, locale),
        })
      }
      return t('calendar.pickArrival')
    }
    if (fechaInicio) {
      return t('calendar.daySelected', {
        day: fechaInicio.getDate(),
        month: formatMonthLong(fechaInicio, locale),
        year: fechaInicio.getFullYear(),
      })
    }
    return t('calendar.pickDay')
  }

  const confirmarSeleccion = () => {
    const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onSeleccionarFechas({
      fechaInicio: toISO(fechaInicio),
      fechaFin: fechaFin ? toISO(fechaFin) : toISO(fechaInicio),
      numPersonas,
    })
  }

  return (
    <div
      ref={refDialogo}
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={t('calendar.dialogLabel')}
    >
      <div className="animate-modal-box w-full max-w-sm rounded-[22px] bg-white p-5 ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-verde-bosque">
            {paso === 'personas'
              ? t('calendar.peopleTitle')
              : esHospedaje
                ? t('calendar.chooseDates')
                : t('calendar.chooseDate')}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('common:modal.close')}
            className="cursor-pointer rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {paso === 'personas' && (
          <div className="mt-6">
            <p className="text-base text-neutral-700">
              {esHospedaje ? t('calendar.questionStay') : t('calendar.questionExperience')}
            </p>
            <p className="mt-1 text-sm text-cafe">
              {t('calendar.maxCapacity', { count: experiencia.capacidad || 1 })}
            </p>

            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setNumPersonas((n) => Math.max(1, n - 1))}
                aria-label={t('calendar.less')}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-iguana-hondo text-2xl font-bold text-iguana-hondo transition-colors hover:bg-iguana-hondo/10"
              >
                −
              </button>
              <div className="w-20 text-center">
                <p className="text-4xl font-extrabold text-verde-bosque">{numPersonas}</p>
                <p className="text-xs font-semibold text-cafe">
                  {t('calendar.unit', { count: numPersonas })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNumPersonas((n) => Math.min(experiencia.capacidad || 99, n + 1))}
                aria-label={t('calendar.more')}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-iguana-hondo text-2xl font-bold text-iguana-hondo transition-colors hover:bg-iguana-hondo/10"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPaso('fecha')}
              className="mt-6 w-full cursor-pointer rounded-full bg-iguana-hondo px-4 py-3 text-base font-bold text-white transition-colors hover:bg-verde-bosque"
            >
              {t('calendar.continue')}
            </button>
          </div>
        )}

        {paso === 'fecha' && (
        <>
        {cargandoFechas ? (
          <p className="mt-6 text-center text-sm text-cafe">{t('calendar.loading')}</p>
        ) : (
        <>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => cambiarMes(-1)}
            aria-label={t('common:calendar.prevMonth')}
            className="cursor-pointer rounded-full p-2 text-iguana-hondo transition-colors hover:bg-iguana-hondo/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <p className="text-base font-bold text-verde-bosque">
            {formatMonthYear(new Date(anio, mes, 1), locale)}
          </p>
          <button
            type="button"
            onClick={() => cambiarMes(1)}
            aria-label={t('common:calendar.nextMonth')}
            className="cursor-pointer rounded-full p-2 text-iguana-hondo transition-colors hover:bg-iguana-hondo/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }, (_, i) => {
            const label = weekdayShortMonFirst(i, locale)
            return (
              <div key={label} className="py-1 text-center text-xs font-semibold uppercase text-cafe">
                {label}
              </div>
            )
          })}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`vacio-${i}`} />
          ))}
          {Array.from({ length: diasEnMes }).map((_, i) => {
            const dia = i + 1
            const pasado = esPasado(dia)
            const ocupado = !pasado && estaOcupado(dia)
            const noDisponible = !pasado && !ocupado && !estaDisponible(dia)
            const esHoyDia = esHoy(dia)
            const enRango = estaEnRango(dia)
            const esInicio = esExtremoInicio(dia)
            const esFin = esExtremoFin(dia)
            let clases =
              'flex h-10 items-center justify-center rounded-full text-sm transition-colors '
            if (pasado) {
              clases += 'cursor-not-allowed text-neutral-300'
            } else if (ocupado) {
              clases += 'cursor-not-allowed bg-red-100 text-red-400 line-through'
            } else if (noDisponible) {
              clases += 'cursor-not-allowed bg-neutral-100 text-neutral-400'
            } else if (enRango) {
              clases += 'bg-iguana-hondo/20 font-semibold text-verde-bosque hover:bg-iguana-hondo/30'
            } else if (esInicio || esFin) {
              clases += 'cursor-pointer bg-iguana-hondo font-bold text-white hover:bg-iguana-hondo'
            } else if (esHoyDia) {
              clases += 'cursor-pointer border border-iguana-hondo font-semibold text-iguana-hondo hover:bg-iguana-hondo/10'
            } else {
              clases += 'cursor-pointer text-neutral-700 hover:bg-iguana-hondo/10'
            }
            return (
              <button
                key={dia}
                type="button"
                disabled={pasado || ocupado || noDisponible}
                onClick={() => seleccionarDia(dia)}
                className={clases}
                title={ocupado ? t('calendar.bookedTitle') : noDisponible ? t('calendar.notOfferedTitle') : ''}
              >
                {dia}
              </button>
            )
          })}
        </div>

        {fechasOcupadas.length > 0 && (
          <p className="mt-2 text-center text-xs text-red-500">
            {t('calendar.redLegend')}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">
            {textoSeleccion()}
          </p>
          <button
            type="button"
            disabled={!fechaInicio || (esHospedaje && !fechaFin)}
            onClick={confirmarSeleccion}
            className="cursor-pointer rounded-full bg-iguana-hondo px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-verde-bosque disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('calendar.continue')}
          </button>
        </div>
        </>
        )}
        </>
        )}
      </div>
    </div>
  )
}

// Selección de reserva guardada antes de mandar al login a una persona sin
// sesión: la página se desmonta en el viaje de ida y vuelta, así que las fechas
// y la cantidad de personas se recuperan al volver. Solo aplica a la misma
// experiencia y se descarta una vez consumida.
const RESERVA_PENDIENTE_KEY = 'iguana_reserva_pendiente'

function leerReservaPendiente(id) {
  try {
    const guardada = sessionStorage.getItem(RESERVA_PENDIENTE_KEY)
    if (!guardada) return null
    const datos = JSON.parse(guardada)
    if (String(datos.experienciaId) !== String(id)) return null
    return { fechaInicio: datos.fechaInicio, fechaFin: datos.fechaFin, numPersonas: datos.numPersonas }
  } catch {
    return null
  }
}

export default function ExperienceDetailPage() {
  const { t, i18n } = useTranslation('experiencia')
  const { id } = useParams()
  const navigate = useNavigate()
  const contentLocale = getContentLocale(i18n.resolvedLanguage || i18n.language)
  const [experiencia, setExperiencia] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  // Si hay una selección guardada, la página abre directo en el formulario.
  const [reservaPendiente] = useState(() => leerReservaPendiente(id))
  const [pasoReserva, setPasoReserva] = useState(reservaPendiente ? 'formulario' : 'inicio')
  const [datosReserva, setDatosReserva] = useState(reservaPendiente)
  const [toast, setToast] = useState(null)
  const [resenas, setResenas] = useState(null)
  // UI-only hint: the server is the authority (PostReserva rejects a host
  // booking their own listing). Reading the cache just lets us hide the CTA.
  const [usuarioId, setUsuarioId] = useState(() => leerSesionCache()?.id ?? null)
  const [chatAbierto, setChatAbierto] = useState(false)

  useEffect(() => {
    let activo = true
    getExperienciaById(id, contentLocale)
      .then((data) => {
        if (activo) setExperiencia(data)
      })
      .catch((e) => {
        if (activo) setError(e.message)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [id, contentLocale])

  useEffect(() => {
    let activo = true
    getResenasPublicacion(id, contentLocale)
      .then((data) => {
        if (activo) setResenas(data)
      })
      .catch(() => {
        if (activo) setResenas({ promedio: 0, total: 0, resenas: [] })
      })
    return () => { activo = false }
  }, [id, contentLocale])

  // Una vez consumida, la selección guardada se descarta para que no reaparezca
  // en una visita posterior.
  useEffect(() => {
    if (reservaPendiente) sessionStorage.removeItem(RESERVA_PENDIENTE_KEY)
  }, [reservaPendiente])

  useEffect(() => {
    const actualizar = () => setUsuarioId(leerSesionCache()?.id ?? null)
    window.addEventListener('auth-change', actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener('auth-change', actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [])

  const seleccionarFechas = useCallback((datos) => {
    setDatosReserva(datos)
    setPasoReserva('formulario')
    // Sin sesión, ir al login desmonta esta página: dejamos lo elegido guardado
    // para reabrir el formulario al volver (se borra al recuperarlo o al reservar).
    if (!sessionStorage.getItem('iguana_usuario')) {
      sessionStorage.setItem(RESERVA_PENDIENTE_KEY, JSON.stringify({ experienciaId: id, ...datos }))
    }
  }, [id])

  const manejarReservaCreada = () => {
    sessionStorage.removeItem(RESERVA_PENDIENTE_KEY)
    setPasoReserva('inicio')
    setToast({ tipo: 'exito', mensaje: t('page.toastBooked') })
    // F5 (task 6.4): post-booking landing follows the locale route table.
    setTimeout(() => navigate(localePath('reservations')), 2000)
  }

  const esMiPublicacion =
    usuarioId != null &&
    experiencia?.anfitrionUsuarioId != null &&
    Number(usuarioId) === Number(experiencia.anfitrionUsuarioId)

  // A host never gets the calendar/form, even if a pending selection survived
  // in sessionStorage from a previous visit.
  useEffect(() => {
    if (esMiPublicacion && pasoReserva !== 'inicio') {
      sessionStorage.removeItem(RESERVA_PENDIENTE_KEY)
      setPasoReserva('inicio')
    }
  }, [esMiPublicacion, pasoReserva])

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8">
      <Link to={localePath('catalog')} className="mb-4 block font-medium text-azul hover:text-verde-hoja">
        ← {t('page.backToCatalog')}
      </Link>

      {cargando && <p className="text-cafe">{t('page.loading')}</p>}
      {error && <p className="text-red-700">{t('page.error', { error })}</p>}
      {!cargando && !error && !experiencia && <p className="text-cafe">{t('page.notFound')}</p>}

      {experiencia && (
        <div className="rounded-[22px] border border-neutral-200 bg-white p-4 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Galeria imagenes={experiencia.imagenes} titulo={experiencia.titulo} />
            </div>
            <div className="lg:col-span-2">
              <InfoBox
                experiencia={experiencia}
                onReservar={() => { if (!esMiPublicacion) setPasoReserva('calendario') }}
                resumenResenas={resenas}
                esMiPublicacion={esMiPublicacion}
              />
            </div>
          </div>

          <section className="mt-8 border-t border-neutral-100 pt-8">
            <h3 className="text-2xl font-bold text-verde-bosque">{t('page.descriptionTitle')}</h3>
            <p className="mt-4 text-lg leading-relaxed text-neutral-800">
              {experiencia.descripcion || t('page.noDescription')}
            </p>
          </section>

          {(experiencia.experiencias ?? []).some(item =>
            item.descripcion || item.nombre !== experiencia.titulo,
          ) && (
            <section className="mt-8 border-t border-neutral-100 pt-8">
              <h3 className="text-2xl font-bold text-verde-bosque">{t('page.experiencesTitle')}</h3>
              <ul className="mt-4 space-y-4">
                {(experiencia.experiencias ?? [])
                  .filter(item => item.descripcion || item.nombre !== experiencia.titulo)
                  .map((item, index) => (
                    <li key={`${item.nombre}-${index}`} className="rounded-[22px] bg-crema/60 p-4">
                      {item.nombre !== experiencia.titulo && (
                        <h4 className="font-semibold text-verde-bosque">{item.nombre}</h4>
                      )}
                      {item.descripcion && (
                        <p className="text-neutral-700">{item.descripcion}</p>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <CardAnfitrion
            anfitrionId={experiencia.anfitrionId}
            nombre={experiencia.anfitrion}
            foto={experiencia.anfitrionFoto}
            descripcion={experiencia.anfitrionDescripcion}
            verificado={experiencia.anfitrionVerificado}
            onContactar={() => setChatAbierto(true)}
          />

          {/* Drawer bound to the publication id carried by the mapped
              experience — never re-derived from the route :id here. */}
          <ChatPanel
            abierto={chatAbierto}
            anfitrionId={experiencia.anfitrionId}
            publicacionId={experiencia.publicacionId}
            onCerrar={() => setChatAbierto(false)}
          />

          {experiencia.amenidades.length > 0 && (
            <section className="mt-8 border-t border-neutral-100 pt-8">
              <h3 className="text-2xl font-bold text-verde-bosque">{t('page.amenitiesTitle')}</h3>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {experiencia.amenidades.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 px-1 py-2 text-base font-medium text-neutral-800">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-verde-hoja/15 text-verde-bosque">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Horarios horarios={experiencia.horarios} />

          <Mapa latitud={experiencia.latitud} longitud={experiencia.longitud} />

          <SeccionResenas data={resenas} />
        </div>
      )}

      {experiencia && pasoReserva === 'calendario' && (
        <CalendarioReserva
          experiencia={experiencia}
          esHospedaje={experiencia.tipo === 'hospedaje'}
          onSeleccionarFechas={seleccionarFechas}
          onCerrar={() => { sessionStorage.removeItem(RESERVA_PENDIENTE_KEY); setPasoReserva('inicio') }}
        />
      )}

      {experiencia && pasoReserva === 'formulario' && datosReserva && (
        <FormularioReserva
          experiencia={experiencia}
          fechaInicio={datosReserva.fechaInicio}
          fechaFin={datosReserva.fechaFin}
          numPersonas={datosReserva.numPersonas}
          onCancelar={() => setPasoReserva('calendario')}
          onReservada={manejarReservaCreada}
        />
      )}

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </div>
  )
}
