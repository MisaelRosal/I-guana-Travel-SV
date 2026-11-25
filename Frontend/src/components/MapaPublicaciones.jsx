import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { localePath } from '../i18n/routes.jsx'

const dotIcon = ({ color, size }) => L.divIcon({
  className: '',
  html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></span>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  popupAnchor: [0, -size / 2],
})

export const hospedajeIcon = dotIcon({ color: '#1F5C3A', size: 18 })
export const experienciaIcon = dotIcon({ color: '#B45309', size: 14 })

const CENTRO_EL_SALVADOR = [13.7942, -88.8965]

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number.parseFloat(valor)
  return Number.isFinite(n) ? n : null
}

function posicion(lat, lng) {
  if (lat === null || lng === null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return [lat, lng]
}

export function puntosDePublicacion(publicaciones = []) {
  if (!Array.isArray(publicaciones)) return []
  const puntos = []
  publicaciones.forEach((publicacion) => {
    if (!publicacion) return
    const esHospedaje = publicacion.tipo === 'hospedaje'
    const coordenadas = esHospedaje
      ? posicion(numero(publicacion.latitud), numero(publicacion.longitud))
      : (
        posicion(numero(publicacion.destinoLatitud), numero(publicacion.destinoLongitud)) ??
        posicion(numero(publicacion.puntoEncuentroLatitud), numero(publicacion.puntoEncuentroLongitud)) ??
        posicion(numero(publicacion.latitud), numero(publicacion.longitud))
      )
    if (!coordenadas) return
    puntos.push({ publicacion, posicion: coordenadas, esHospedaje })
  })
  return puntos
}

export default function MapaPublicaciones({ publicaciones = [] }) {
  const { t } = useTranslation('catalog')
  const [filtroTipo, setFiltroTipo] = useState('')
  const todos = puntosDePublicacion(publicaciones)
  const puntos = filtroTipo
    ? todos.filter((p) => (filtroTipo === 'hospedaje' ? p.esHospedaje : !p.esHospedaje))
    : todos

  if (todos.length === 0) return null

  const opcionesFiltro = [
    { valor: '', etiqueta: t('type.all') },
    { valor: 'experiencia', etiqueta: t('type.experiences') },
    { valor: 'hospedaje', etiqueta: t('type.stays') },
  ]

  return (
    <section className="mx-auto max-w-7xl px-4 py-10" aria-labelledby="mapa-publicaciones-titulo">
      <div className="rounded-[22px] border border-cafe-claro bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="mapa-publicaciones-titulo" className="text-2xl font-extrabold text-verde-bosque">
              {t('map.title')}
            </h2>
            <p className="mt-1 text-sm text-cafe">{t('map.subtitle', { count: puntos.length })}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={t('filters.typeGroup')}
              className="flex items-center gap-1 rounded-full border-2 border-verde-bosque bg-verde-bosque/5 p-1"
            >
              {opcionesFiltro.map((op) => (
                <button
                  key={op.valor || 'todos'}
                  type="button"
                  onClick={() => setFiltroTipo(op.valor)}
                  aria-pressed={filtroTipo === op.valor}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs transition-colors ${
                    filtroTipo === op.valor
                      ? 'bg-verde-bosque font-semibold text-white'
                      : 'text-verde-bosque hover:bg-white'
                  }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cafe">
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-iguana-hondo" aria-hidden="true" />
                {t('map.legendStays')}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber" aria-hidden="true" />
                {t('map.legendExperiences')}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[22px] border border-cafe-claro">
          <MapContainer
            center={CENTRO_EL_SALVADOR}
            zoom={9}
            scrollWheelZoom={false}
            style={{ height: '420px', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {puntos.map(({ publicacion, posicion: pos, esHospedaje }) => (
              <Marker
                key={publicacion.id}
                position={pos}
                icon={esHospedaje ? hospedajeIcon : experienciaIcon}
              >
                <Popup>
                  <Link
                    to={localePath('experienceDetail', { id: publicacion.id })}
                    className="block w-48"
                  >
                    <img
                      src={(publicacion.imagenes && publicacion.imagenes[0]) || '/logo.png'}
                      alt={publicacion.titulo}
                      className="h-28 w-full rounded-xl object-cover transition-opacity hover:opacity-80"
                    />
                    <span className="mt-2 inline-block rounded-full bg-crema px-2 py-0.5 text-[11px] font-semibold text-cafe">
                      {esHospedaje ? t('type.stays') : t('type.experiences')}
                    </span>
                    <p className="mt-1 text-sm font-bold text-verde-bosque">{publicacion.titulo}</p>
                    <span className="mt-2 inline-block text-xs font-semibold text-iguana-hondo">
                      {t('map.view')}
                    </span>
                  </Link>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </section>
  )
}
