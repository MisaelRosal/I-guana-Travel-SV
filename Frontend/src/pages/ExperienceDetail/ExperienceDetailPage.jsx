import { useEffect, useState, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { getExperienciaById } from '../../services/experiencias'
import { getDisponibilidad } from '../../services/reservas'
import FormularioReserva from '../../components/FormularioReserva'
import Toast from '../../components/Toast.jsx'

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// F4 owns this Intl formatter and the manual day/month arrays below;
// extraction leaves them untouched.
const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function Galeria({ imagenes, titulo }) {
  const { t } = useTranslation('experiencia')
  const [indice, setIndice] = useState(0)
  const [ampliada, setAmpliada] = useState(false)
  const primera = imagenes[0]

  // Lightbox: cerrar la imagen ampliada con la tecla Escape.
  useEffect(() => {
    if (!ampliada) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setAmpliada(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ampliada])

  return (
    <div>
      <div className="relative h-[min(60vw,420px)] max-sm:h-[320px] overflow-hidden rounded-xl bg-neutral-100">
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
              className={`cursor-pointer overflow-hidden rounded-lg border-2 ${i === indice ? 'border-terracota' : 'border-transparent'}`}
            >
              <img src={img} alt={`${titulo} ${i + 1}`} className="aspect-[16/10] w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Vista ampliada (lightbox): la imagen seleccionada en grande sobre fondo oscuro */}
      {ampliada && primera && (
        <div
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
            className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
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

function InfoBox({ experiencia, onReservar }) {
  const { t } = useTranslation('experiencia')
  const esHospedaje = experiencia.tipo === 'hospedaje'
  // Slash stays an inline glyph so the ES render remains byte-comparable.
  const unidad = esHospedaje ? t('card.perNight') : t('card.perPerson')

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-terracota">{experiencia.categoria}</p>
          <h2 className="mt-1 text-3xl font-bold leading-tight text-verde-bosque">{experiencia.titulo}</h2>
          <p className="mt-2 flex items-center gap-1 text-base text-neutral-600">
            <svg className="h-5 w-5 text-terracota" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {experiencia.municipio}, {experiencia.departamento}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-baseline gap-1.5 border-b border-neutral-100 pb-5">
        <span className="text-4xl font-extrabold text-terracota">{formatoPrecio.format(experiencia.precio)}</span>
        <span className="text-lg font-medium text-neutral-600"> /{unidad}</span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
        {esHospedaje ? (
          <>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.capacity')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{t('info.guests', { count: experiencia.capacidad })}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.rooms')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.habitaciones || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.beds')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.camas || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.baths')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.banos || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.checkIn')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.horaEntrada || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.checkOut')}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.horaSalida || '—'}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.cupos')}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{t('info.persons', { count: experiencia.capacidad })}</dd>
          </div>
        )}
        {experiencia.anfitrion && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.host')}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-verde-bosque">{experiencia.anfitrion}</dd>
          </div>
        )}
        {experiencia.direccion && (
          <div className="col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.address')}</dt>
            <dd className="mt-0.5 text-base text-neutral-700">{experiencia.direccion}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('info.status')}</dt>
          <dd className="mt-0.5 text-lg font-semibold text-verde-bosque capitalize">{experiencia.estado}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onReservar}
        className="mt-7 block w-full cursor-pointer rounded-lg bg-terracota px-4 py-4 text-center text-lg font-bold text-white transition-colors hover:bg-verde-bosque shadow-sm"
      >
        {t('info.bookNow')}
      </button>

      <button
        type="button"
        onClick={() => document.getElementById('ubicacion')?.scrollIntoView({ behavior: 'smooth' })}
        className="mt-3 block w-full cursor-pointer text-center font-medium text-azul transition-colors hover:text-azul-cielo"
      >
        {t('info.howToArrive')}
      </button>
    </div>
  )
}

function CardAnfitrion({ anfitrionId, nombre, foto, descripcion, verificado }) {
  const { t } = useTranslation('experiencia')
  if (!anfitrionId) return null
  return (
    <section className="mt-8 border-t border-neutral-100 pt-8">
      <h3 className="text-2xl font-bold text-verde-bosque">{t('host.title')}</h3>
      <Link
        to={`/anfitriones/${anfitrionId}`}
        className="mt-4 flex items-start gap-4 rounded-xl p-1 transition-colors hover:bg-neutral-50"
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
          <span className="mt-2 inline-block font-medium text-azul hover:text-azul-cielo">
            {t('host.fullProfile')} →
          </span>
        </div>
      </Link>
    </section>
  )
}

function Horarios({ horarios }) {
  const { t } = useTranslation('experiencia')
  if (!horarios.length) return null
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

  const conFecha = horarios.filter((h) => h.fecha).slice().sort((a, b) => a.fecha.localeCompare(b.fecha))
  const porDiaSemana = horarios.filter((h) => !h.fecha && h.diaSemana != null)

  const formatearFecha = (fecha) => {
    const [, m, d] = fecha.split('-')
    return `${parseInt(d, 10)} ${MESES_CORTOS[parseInt(m, 10) - 1]}`
  }

  if (conFecha.length > 0) {
    const rango = (h) => `${h.horaInicio.slice(0, 5)} – ${h.horaFin.slice(0, 5)}`
    return (
      <section className="mt-8 border-t border-neutral-100 pt-8">
        <h3 className="text-2xl font-bold text-verde-bosque">{t('schedule.datesTitle')}</h3>
        <p className="mt-1 text-sm text-cafe">{t('schedule.datesHint')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {conFecha.map((h, i) => (
            <div key={i} className="min-w-24 rounded-lg bg-crema px-4 py-2">
              <p className="text-sm font-bold capitalize text-verde-bosque">{formatearFecha(h.fecha)}</p>
              <p className="text-xs font-medium text-cafe">{rango(h)}</p>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const dias = [...new Set(porDiaSemana.map((h) => h.diaSemana))].sort()
  return (
    <section className="mt-8 border-t border-neutral-100 pt-8">
      <h3 className="text-2xl font-bold text-verde-bosque">{t('schedule.weeklyTitle')}</h3>
      <div className="mt-4 flex flex-wrap gap-3">
        {dias.map((dia) => {
          const hs = porDiaSemana.filter((h) => h.diaSemana === dia)
          return (
            <div key={dia} className="min-w-28 rounded-lg bg-crema px-5 py-3">
              <p className="text-base font-bold text-verde-bosque">{DIAS[dia]}</p>
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
      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 shadow-sm">
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

  const nombreMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  const nombreDias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
          month: nombreMeses[fechaFin.getMonth()],
        })
      }
      if (fechaInicio) {
        return t('calendar.startHint', {
          day: fechaInicio.getDate(),
          month: nombreMeses[fechaInicio.getMonth()],
        })
      }
      return t('calendar.pickArrival')
    }
    if (fechaInicio) {
      return t('calendar.daySelected', {
        day: fechaInicio.getDate(),
        month: nombreMeses[fechaInicio.getMonth()],
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
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={t('calendar.dialogLabel')}
    >
      <div className="animate-modal-box w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
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
            className="cursor-pointer rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
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
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg border border-terracota text-2xl font-bold text-terracota transition-colors hover:bg-terracota/10"
              >
                −
              </button>
              <div className="w-20 text-center">
                <p className="text-4xl font-extrabold text-verde-bosque">{numPersonas}</p>
                <p className="text-xs font-semibold uppercase text-cafe">
                  {t('calendar.unit', { count: numPersonas })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNumPersonas((n) => Math.min(experiencia.capacidad || 99, n + 1))}
                aria-label={t('calendar.more')}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg border border-terracota text-2xl font-bold text-terracota transition-colors hover:bg-terracota/10"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPaso('fecha')}
              className="mt-6 w-full cursor-pointer rounded-lg bg-terracota px-4 py-3 text-base font-bold text-white transition-colors hover:bg-verde-bosque"
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
            className="cursor-pointer rounded-lg p-2 text-terracota transition-colors hover:bg-terracota/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <p className="text-base font-bold text-verde-bosque">
            {nombreMeses[mes]} {anio}
          </p>
          <button
            type="button"
            onClick={() => cambiarMes(1)}
            aria-label={t('common:calendar.nextMonth')}
            className="cursor-pointer rounded-lg p-2 text-terracota transition-colors hover:bg-terracota/10"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1">
          {nombreDias.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-semibold uppercase text-cafe">
              {d}
            </div>
          ))}
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
              'flex h-10 items-center justify-center rounded-lg text-sm transition-colors '
            if (pasado) {
              clases += 'cursor-not-allowed text-neutral-300'
            } else if (ocupado) {
              clases += 'cursor-not-allowed bg-red-100 text-red-400 line-through'
            } else if (noDisponible) {
              clases += 'cursor-not-allowed bg-neutral-100 text-neutral-400'
            } else if (enRango) {
              clases += 'bg-terracota/20 font-semibold text-verde-bosque hover:bg-terracota/30'
            } else if (esInicio || esFin) {
              clases += 'cursor-pointer bg-terracota font-bold text-white hover:bg-terracota'
            } else if (esHoyDia) {
              clases += 'cursor-pointer border border-terracota font-semibold text-terracota hover:bg-terracota/10'
            } else {
              clases += 'cursor-pointer text-neutral-700 hover:bg-terracota/10'
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
            className="cursor-pointer rounded-lg bg-terracota px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-verde-bosque disabled:cursor-not-allowed disabled:opacity-50"
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

export default function ExperienceDetailPage() {
  const { t } = useTranslation('experiencia')
  const { id } = useParams()
  const navigate = useNavigate()
  const [experiencia, setExperiencia] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [pasoReserva, setPasoReserva] = useState('inicio')
  const [datosReserva, setDatosReserva] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let activo = true
    getExperienciaById(id)
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
  }, [id])

  const seleccionarFechas = useCallback((datos) => {
    setDatosReserva(datos)
    setPasoReserva('formulario')
  }, [])

  const manejarReservaCreada = () => {
    setPasoReserva('inicio')
    setToast({ tipo: 'exito', mensaje: t('page.toastBooked') })
    setTimeout(() => navigate('/reservas'), 2000)
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8">
      <Link to="/" className="mb-4 block font-medium text-azul hover:text-azul-cielo">
        ← {t('page.backToCatalog')}
      </Link>

      {cargando && <p className="text-cafe">{t('page.loading')}</p>}
      {error && <p className="text-terracota">{t('page.error', { error })}</p>}
      {!cargando && !error && !experiencia && <p className="text-cafe">{t('page.notFound')}</p>}

      {experiencia && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-8">
          <div className="grid gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Galeria imagenes={experiencia.imagenes} titulo={experiencia.titulo} />
            </div>
            <div className="lg:col-span-2">
              <InfoBox experiencia={experiencia} onReservar={() => setPasoReserva('calendario')} />
            </div>
          </div>

          <section className="mt-8 border-t border-neutral-100 pt-8">
            <h3 className="text-2xl font-bold text-verde-bosque">{t('page.descriptionTitle')}</h3>
            <p className="mt-4 text-lg leading-relaxed text-neutral-800">
              {experiencia.descripcion || t('page.noDescription')}
            </p>
          </section>

          <CardAnfitrion
            anfitrionId={experiencia.anfitrionId}
            nombre={experiencia.anfitrion}
            foto={experiencia.anfitrionFoto}
            descripcion={experiencia.anfitrionDescripcion}
            verificado={experiencia.anfitrionVerificado}
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
        </div>
      )}

      {experiencia && pasoReserva === 'calendario' && (
        <CalendarioReserva
          experiencia={experiencia}
          esHospedaje={experiencia.tipo === 'hospedaje'}
          onSeleccionarFechas={seleccionarFechas}
          onCerrar={() => setPasoReserva('inicio')}
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
    </main>
  )
}