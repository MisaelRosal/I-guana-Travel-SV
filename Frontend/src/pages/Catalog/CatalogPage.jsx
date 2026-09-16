import { useEffect, useMemo, useState } from 'react'
import { getCategorias, getDepartamentos, getExperiencias, getProximasExperiencias } from '../../services/experiencias.js'
import ExperienceCard from '../../components/ExperienceCard.jsx'
import LoadingIguana from '../../components/LoadingIguana.jsx'
import imagenHero from '../../assets/EL-TUNCO.jpg'

const clasesSelect =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul-cielo/40'

function aleatorias(lista, cantidad) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia.slice(0, cantidad)
}

export default function CatalogPage() {
  const [categorias, setCategorias] = useState([])
  const [departamentos, setDepartamentos] = useState([])
  const [experiencias, setExperiencias] = useState([])
  const [proximasExperiencias, setProximasExperiencias] = useState([])
  const [cargando, setCargando] = useState(true)

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [zona, setZona] = useState('')
  const [tipo, setTipo] = useState('')
  const [precioMax, setPrecioMax] = useState('')

  useEffect(() => {
    getCategorias().then(setCategorias)
    getDepartamentos().then(setDepartamentos)
  }, [])

  useEffect(() => {
    setCargando(true)
    getExperiencias({ search: busqueda, categoria, zona, tipo, precioMax })
      .then(setExperiencias)
      .catch(() => setExperiencias([]))
      .finally(() => setCargando(false))
  }, [busqueda, categoria, zona, tipo, precioMax])

  useEffect(() => {
    getProximasExperiencias(3)
      .then(setProximasExperiencias)
      .catch(() => setProximasExperiencias([]))
  }, [])

  const hayFiltros = Boolean(busqueda || categoria || zona || tipo || precioMax)
  const visibles = useMemo(
    () => (hayFiltros ? experiencias : aleatorias(experiencias, 6)),
    [experiencias, hayFiltros],
  )

  const handleBuscar = (e) => {
    e.preventDefault()
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-verde-bosque text-white">
        <img
          src={imagenHero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:py-24">
          <h1 className="text-3xl font-extrabold sm:text-5xl">
            Descubrí las experiencias de <span className="text-verde-hoja">El Salvador</span>
          </h1>
          <p className="mt-3 max-w-2xl text-base text-crema/85 sm:text-lg">
            Surf, café, volcanes y pueblos con encanto. Explorá, reservá y viví el país con
            anfitriones locales.
          </p>
          <form onSubmit={handleBuscar} className="mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cafe"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o descripción…"
                className="w-full rounded-lg border-2 border-cafe-claro bg-white py-3 pl-11 pr-4 text-neutral-800 shadow-md placeholder:text-neutral-500 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-terracota px-6 py-3 font-semibold text-white hover:bg-verde-bosque transition-colors sm:w-auto"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* Filtros y listado */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={clasesSelect}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={zona} onChange={(e) => setZona(e.target.value)} className={clasesSelect}>
            <option value="">Todo El Salvador</option>
            {departamentos.map((d) => (
              <option key={d.nombre} value={d.nombre}>{d.nombre}</option>
            ))}
          </select>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={clasesSelect}>
            <option value="">Cualquier tipo</option>
            <option value="experiencia">Experiencia</option>
            <option value="hospedaje">Hospedaje</option>
          </select>
          <select
            value={precioMax}
            onChange={(e) => setPrecioMax(e.target.value)}
            className={clasesSelect}
          >
            <option value="">Cualquier precio</option>
            <option value="30">Hasta $30</option>
            <option value="40">Hasta $40</option>
            <option value="50">Hasta $50</option>
            <option value="80">Hasta $80</option>
          </select>
          <button
            onClick={() => { setBusqueda(''); setCategoria(''); setZona(''); setTipo(''); setPrecioMax('') }}
            className="rounded-lg bg-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-verde-bosque transition-colors"
          >
            Limpiar filtros
          </button>
        </div>

        {cargando ? (
          <LoadingIguana fullscreen message="Cargando publicaciones…" />
        ) : visibles.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-xl border-2 border-dashed border-cafe-claro bg-white/60 text-cafe">
            <p className="px-6 text-center">
              <span className="block text-lg font-semibold text-verde-bosque">No se encontraron publicaciones</span>
              {busqueda || categoria || zona || tipo || precioMax
                ? 'Probá cambiando los filtros de búsqueda.'
                : 'Creá la primera publicación desde el panel del operador.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((e) => (
              <ExperienceCard key={e.id} experiencia={e} />
            ))}
          </div>
        )}
      </section>

      {/* Próximas experiencias */}
      {proximasExperiencias.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14">
          <div className="rounded-2xl border border-verde-hoja/30 bg-gradient-to-br from-verde-bosque/5 to-crema/50 p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-verde-bosque">
                  Próximas experiencias
                </h2>
                <p className="mt-1 text-sm text-cafe">
                  Las 3 experiencias con pronta disponibilidad por fecha.
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {proximasExperiencias.map((e) => (
                <ExperienceCard key={e.id} experiencia={e} proximaFecha={e.proximaFecha} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
