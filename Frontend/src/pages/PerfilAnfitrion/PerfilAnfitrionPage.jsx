import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAnfitrionPorId } from '../../services/anfitriones.js'
import { getExperiencias } from '../../services/experiencias.js'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function Avatar({ anfitrion, grande }) {
  const cls = grande
    ? 'flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-crema text-5xl font-bold text-cafe shadow-md'
    : 'flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-crema text-lg font-bold text-cafe shadow-sm'
  return (
    <div className={cls}>
      {anfitrion.fotoPerfil ? (
        <img src={anfitrion.fotoPerfil} alt="Foto de perfil" className="h-full w-full object-cover" />
      ) : (
        (anfitrion.nombre || '').charAt(0).toUpperCase()
      )}
    </div>
  )
}

export default function PerfilAnfitrionPage() {
  const { id } = useParams()
  const [anfitrion, setAnfitrion] = useState(null)
  const [publicaciones, setPublicaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let activo = true
    getAnfitrionPorId(id)
      .then((a) => {
        if (activo) setAnfitrion(a)
      })
      .catch((e) => {
        if (activo) setError(e.message)
      })
    getExperiencias()
      .then((exp) => {
        if (activo) setPublicaciones(exp.filter((x) => Number(x.anfitrionId) === Number(id)))
      })
      .catch(() => {})
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [id])

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link to="/" className="mb-4 block font-medium text-azul hover:text-azul-cielo">
        ← Volver al inicio
      </Link>

      {cargando && <p className="text-cafe">Cargando perfil…</p>}
      {error && <p className="text-terracota">Error: {error}</p>}
      {!cargando && !error && !anfitrion && <p className="text-cafe">No se encontró el anfitrión.</p>}

      {anfitrion && (
        <>
          <div className="rounded-xl border border-cafe-claro/60 bg-white p-8 shadow-md">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <Avatar anfitrion={anfitrion} grande />
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-verde-bosque">{anfitrion.nombre}</h1>
                <p className="mt-1 flex items-center justify-center gap-1 text-cafe sm:justify-start">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {anfitrion.municipio?.nombre ?? '—'}
                  {anfitrion.municipio?.departamento ? `, ${anfitrion.municipio.departamento.nombre}` : ''}
                </p>
                <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${anfitrion.verificado ? 'bg-verde-hoja/15 text-verde-bosque' : 'bg-amber-100 text-amber-700'}`}>
                  {anfitrion.verificado ? 'Verificado' : 'Pendiente de verificación'}
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-neutral-100 pt-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-terracota">Sobre mí</h2>
              <p className="mt-2 text-lg leading-relaxed text-neutral-800">
                {anfitrion.descripcion || 'Este anfitrión aún no agregó una descripción.'}
              </p>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-neutral-100 pt-6 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Correo</dt>
                <dd className="mt-0.5 text-neutral-800">{anfitrion.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Teléfono</dt>
                <dd className="mt-0.5 text-neutral-800">{anfitrion.telefono || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Ubicación</dt>
                <dd className="mt-0.5 text-neutral-800">
                  {anfitrion.municipio?.nombre ?? '—'}
                  {anfitrion.municipio?.departamento ? `, ${anfitrion.municipio.departamento.nombre}` : ''}
                </dd>
              </div>
            </dl>
          </div>

          {publicaciones.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold text-verde-bosque">Publicaciones de {anfitrion.nombre}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicaciones.map((exp) => (
                  <Link
                    key={exp.id}
                    to={`/experiencias/${exp.id}`}
                    className="group overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-neutral-100">
                      {exp.imagenes[0] ? (
                        <img src={exp.imagenes[0]} alt={exp.titulo} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-cafe">Sin imagen</div>
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-semibold uppercase tracking-wide text-terracota">{exp.tipo}</p>
                      <h3 className="mt-0.5 text-lg font-bold text-verde-bosque">{exp.titulo}</h3>
                      <p className="mt-1 text-sm text-cafe">{exp.municipio}, {exp.departamento}</p>
                      <p className="mt-2 font-bold text-terracota">
                        {formatoPrecio.format(exp.precio)}
                        <span className="text-sm font-medium text-cafe"> {exp.tipo === 'hospedaje' ? '/noche' : '/persona'}</span>
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}