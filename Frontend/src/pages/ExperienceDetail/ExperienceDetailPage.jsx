import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import { getExperienciaById } from '../../services/experiencias'

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function Galeria({ imagenes, titulo }) {
  const [indice, setIndice] = useState(0)
  const primera = imagenes[0]

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100">
        {primera ? (
          <>
            <img
              src={imagenes[indice % imagenes.length]}
              alt={titulo}
              className="h-full w-full object-cover"
            />
            {imagenes.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setIndice((indice - 1 + imagenes.length) % imagenes.length)}
                  aria-label="Imagen anterior"
                  className="absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setIndice((indice + 1) % imagenes.length)}
                  aria-label="Imagen siguiente"
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
          <div className="flex h-full items-center justify-center text-cafe">Sin imágenes</div>
        )}
      </div>

      {imagenes.length > 1 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {imagenes.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndice(i)}
              className={`cursor-pointer overflow-hidden rounded-lg border-2 ${i === indice ? 'border-terracota' : 'border-transparent'}`}
            >
              <img src={img} alt={`${titulo} ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoBox({ experiencia }) {
  const esHospedaje = experiencia.tipo === 'hospedaje'
  const unidad = esHospedaje ? '/noche' : '/persona'

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-cafe">{experiencia.categoria}</p>
          <h2 className="text-2xl font-bold text-verde-bosque">{experiencia.titulo}</h2>
          <p className="mt-1 text-sm text-cafe">
            {experiencia.municipio}, {experiencia.departamento}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-terracota">{formatoPrecio.format(experiencia.precio)}</span>
        <span className="text-cafe"> {unidad}</span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-5">
        {esHospedaje ? (
          <>
            <div>
              <dt className="text-xs uppercase text-cafe">Capacidad</dt>
              <dd className="text-sm font-semibold text-verde-bosque">{experiencia.capacidad} huéspedes</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-cafe">Habitaciones</dt>
              <dd className="text-sm font-semibold text-verde-bosque">{experiencia.habitaciones || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-cafe">Camas</dt>
              <dd className="text-sm font-semibold text-verde-bosque">{experiencia.camas || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-cafe">Baños</dt>
              <dd className="text-sm font-semibold text-verde-bosque">{experiencia.banos || '—'}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-xs uppercase text-cafe">Cupos</dt>
            <dd className="text-sm font-semibold text-verde-bosque">{experiencia.capacidad} personas</dd>
          </div>
        )}
        {experiencia.anfitrion && (
          <div>
            <dt className="text-xs uppercase text-cafe">Anfitrión</dt>
            <dd className="text-sm font-semibold text-verde-bosque">{experiencia.anfitrion}</dd>
          </div>
        )}
        {experiencia.direccion && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-cafe">Dirección</dt>
            <dd className="text-sm text-neutral-700">{experiencia.direccion}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase text-cafe">Estado</dt>
          <dd className="text-sm font-semibold text-verde-bosque capitalize">{experiencia.estado}</dd>
        </div>
      </dl>

      <Link
        to="/"
        className="mt-6 block w-full rounded-lg bg-terracota px-4 py-3 text-center font-semibold text-white hover:bg-verde-bosque transition-colors"
      >
        Reservar ahora
      </Link>
    </div>
  )
}

function ExperienciasLista({ experiencias }) {
  if (!experiencias.length) return null
  return (
    <section className="mt-10">
      <h3 className="text-xl font-bold text-verde-bosque">Experiencias incluidas</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {experiencias.map((e, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white p-4">
            <h4 className="font-semibold text-verde-bosque">{e.nombre}</h4>
            {e.descripcion && <p className="mt-1 text-sm text-neutral-600">{e.descripcion}</p>}
            <p className="mt-2 text-xs text-cafe">
              {e.duracionHoras ? `${e.duracionHoras} h` : ''}
              {e.duracionHoras && e.precioAdicional != null ? ' · ' : ''}
              {e.precioAdicional != null && e.precioAdicional > 0 ? `${formatoPrecio.format(e.precioAdicional)} adicional` : ''}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Horarios({ horarios }) {
  if (!horarios.length) return null
  const dias = [...new Set(horarios.map((h) => h.diaSemana))].sort()
  return (
    <section className="mt-10">
      <h3 className="text-xl font-bold text-verde-bosque">Horarios disponibles</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {dias.map((dia) => {
          const hs = horarios.filter((h) => h.diaSemana === dia)
          return (
            <div key={dia} className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
              <p className="text-sm font-semibold text-verde-bosque">{DIAS[dia]}</p>
              <p className="text-xs text-cafe">
                {hs.map((h) => `${h.horaInicio.slice(0, 5)} – ${h.horaFin.slice(0, 5)}`).join(' · ')}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Mapa({ latitud, longitud, municipio }) {
  const posicion = latitud && longitud ? [parseFloat(latitud), parseFloat(longitud)] : null
  return (
    <section className="mt-10">
      <h3 className="text-xl font-bold text-verde-bosque">Ubicación</h3>
      <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
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
      <p className="mt-2 text-sm text-cafe">
        {municipio || 'Ubicación no especificada'}
      </p>
    </section>
  )
}

export default function ExperienceDetailPage() {
  const { id } = useParams()
  const [experiencia, setExperiencia] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

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
    return () => {
      activo = false
    }
  }, [id])

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Link to="/" className="mb-4 block font-medium text-azul hover:text-azul-cielo">
        ← Volver al catálogo
      </Link>

      {cargando && <p className="text-cafe">Cargando información…</p>}
      {error && <p className="text-terracota">Error: {error}</p>}
      {!cargando && !error && !experiencia && <p className="text-cafe">No se encontró la experiencia.</p>}

      {experiencia && (
        <>
          <div className="grid gap-8 lg:grid-cols-2">
            <Galeria imagenes={experiencia.imagenes} titulo={experiencia.titulo} />
            <InfoBox experiencia={experiencia} />
          </div>

          <ExperienciasLista experiencias={experiencia.experiencias} />

          <section className="mt-10">
            <h3 className="text-xl font-bold text-verde-bosque">Descripción</h3>
            <p className="mt-3 text-neutral-700">
              {experiencia.descripcion || 'Sin descripción disponible.'}
            </p>
          </section>

          {experiencia.amenidades.length > 0 && (
            <section className="mt-10">
              <h3 className="text-xl font-bold text-verde-bosque">Amenidades</h3>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {experiencia.amenidades.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-neutral-700 border border-neutral-100">
                    <span className="text-verde-hoja">✓</span>
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Horarios horarios={experiencia.horarios} />

          <Mapa
            latitud={experiencia.latitud}
            longitud={experiencia.longitud}
            municipio={`${experiencia.municipio}, ${experiencia.departamento}`}
          />
        </>
      )}
    </main>
  )
}
