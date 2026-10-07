import { useEffect, useMemo, useRef, useState } from 'react'
import { getCategorias, getDepartamentos, getExperiencias, getProximasExperiencias } from '../../services/experiencias.js'
import ExperienceCard from '../../components/ExperienceCard.jsx'
import LoadingIguana from '../../components/LoadingIguana.jsx'
import imagenHero from '../../assets/EL-TUNCO.jpg'

// La pantalla de inicio (logo a pantalla completa) se mantiene este tiempo
// minimo aunque la API responda antes, para que el splash siempre se vea.
const CARGA_MINIMA_MS = 2000

// Filtro desplegable con la estetica del sitio: pastilla redondeada con borde
// cafe, panel de opciones estilo tarjeta (hover crema, seleccion verde-bosque
// con tilde). Cierra con Escape o clic fuera. Sustituye al <select> nativo.
function FiltroDesplegable({ etiqueta, placeholder, valor, opciones, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const cerrarFuera = (evento) => {
      if (contenedor.current && !contenedor.current.contains(evento.target)) setAbierto(false)
    }
    const cerrarEscape = (evento) => {
      if (evento.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => {
      document.removeEventListener('mousedown', cerrarFuera)
      document.removeEventListener('keydown', cerrarEscape)
    }
  }, [abierto])

  const seleccion = opciones.find((op) => op.valor === valor)
  const todas = [{ valor: '', etiqueta: placeholder }, ...opciones]

  return (
    <div className="relative w-full sm:min-w-[190px] sm:flex-1" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierto((prev) => !prev)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border-2 bg-white px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 ${
          valor
            ? 'border-verde-bosque text-verde-bosque shadow-sm'
            : 'border-verde-bosque text-neutral-700 hover:border-verde-hoja'
        }`}
      >
        <span className="min-w-0 truncate">
          <span className="mr-1.5 text-xs font-bold uppercase tracking-wide opacity-70">{etiqueta}</span>
          <span className={valor ? 'font-semibold' : 'text-neutral-500'}>
            {seleccion ? seleccion.etiqueta : placeholder}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div
          role="listbox"
          aria-label={`Opciones de ${etiqueta}`}
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl"
        >
          {todas.map((op) => {
            const activa = op.valor === valor
            return (
              <button
                key={op.valor || '__cualquiera__'}
                type="button"
                role="option"
                aria-selected={activa}
                onClick={() => { onChange(op.valor); setAbierto(false) }}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left text-sm transition-colors ${
                  activa
                    ? 'bg-verde-bosque/10 font-semibold text-verde-bosque'
                    : 'text-neutral-700 hover:bg-crema'
                }`}
              >
                <span className="truncate">{op.etiqueta}</span>
                {activa && (
                  <svg
                    className="h-4 w-4 shrink-0 text-verde-bosque"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
  // La pantalla de carga completa solo se muestra la primera vez que se entra.
  // Al cambiar filtros o escribir en el buscador la lista se actualiza sin tapar la pantalla.
  const primeraCarga = useRef(true)
  const temporizadorCarga = useRef(null)

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [zona, setZona] = useState('')
  const [tipo, setTipo] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  // En móvil los filtros van ocultos tras un botón "Filtros" hasta que se abre.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const filtrosActivos = [tipo, categoria, zona, precioMax].filter(Boolean).length

  useEffect(() => {
    getCategorias().then(setCategorias)
    getDepartamentos().then(setDepartamentos)
  }, [])

  useEffect(() => {
    let activo = true
    if (primeraCarga.current) setCargando(true)
    const inicioCarga = Date.now()

    getExperiencias({ search: busqueda, categoria, zona, tipo, precioMax })
      .then((datos) => { if (activo) setExperiencias(datos) })
      .catch(() => { if (activo) setExperiencias([]) })
      .finally(() => {
        if (primeraCarga.current) {
          primeraCarga.current = false
          const restante = Math.max(0, CARGA_MINIMA_MS - (Date.now() - inicioCarga))
          temporizadorCarga.current = setTimeout(() => setCargando(false), restante)
        }
      })

    return () => { activo = false }
  }, [busqueda, categoria, zona, tipo, precioMax])

  useEffect(() => () => clearTimeout(temporizadorCarga.current), [])

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
            Descubre las experiencias de <span className="text-verde-hoja">El Salvador</span>
          </h1>
          <p className="mt-3 max-w-2xl text-base text-crema/85 sm:text-lg">
            Surf, café, volcanes y pueblos con encanto. Explora, reserva y vive el país con
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
                className="w-full rounded-lg border-2 border-verde-bosque bg-white py-3 pl-11 pr-4 text-neutral-800 shadow-md placeholder:text-neutral-500 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
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
        <div className="mb-6 rounded-2xl border border-verde-bosque/30 bg-white p-4 shadow-sm sm:p-5">
          {/* Botón tipo menú de filtros: visible SOLO en móvil, colapsa/expande los controles */}
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((prev) => !prev)}
            aria-expanded={filtrosAbiertos}
            aria-controls="filtros-controles"
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border-2 border-verde-bosque bg-verde-bosque/5 px-4 py-3 text-sm font-bold text-verde-bosque transition-colors hover:bg-verde-bosque/10 focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 sm:hidden"
          >
            <span className="flex items-center gap-2">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
            </span>
            <svg
              className={`h-4 w-4 shrink-0 transition-transform ${filtrosAbiertos ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <p className="mb-3 hidden text-xs font-bold uppercase tracking-wider text-verde-bosque sm:block">Filtrar resultados</p>

          <div
            id="filtros-controles"
            className={`${filtrosAbiertos ? 'flex' : 'hidden'} mt-3 flex-col gap-3 sm:mt-0 sm:flex sm:flex-row sm:flex-wrap sm:items-center`}
          >
            {/* Tipo: control segmentado con la paleta del sitio */}
            <div
              role="group"
              aria-label="Tipo de publicación"
              className="flex w-full items-center gap-1 rounded-xl border-2 border-verde-bosque bg-verde-bosque/5 p-1.5 sm:min-w-[190px] sm:flex-1"
            >
              {[
                { valor: '', etiqueta: 'Todos' },
                { valor: 'experiencia', etiqueta: 'Experiencias' },
                { valor: 'hospedaje', etiqueta: 'Hospedaje' },
              ].map((op) => (
                <button
                  key={op.valor || 'todos'}
                  type="button"
                  onClick={() => setTipo(op.valor)}
                  aria-pressed={tipo === op.valor}
                  className={`flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                    tipo === op.valor
                      ? 'bg-verde-bosque font-semibold text-white shadow-sm'
                      : 'text-verde-bosque hover:bg-white'
                  }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>

            <FiltroDesplegable
              etiqueta="Categoría"
              placeholder="Todas las categorías"
              valor={categoria}
              opciones={categorias.map((c) => ({ valor: c, etiqueta: c }))}
              onChange={setCategoria}
            />
            <FiltroDesplegable
              etiqueta="Zona"
              placeholder="Todo El Salvador"
              valor={zona}
              opciones={departamentos.map((d) => ({ valor: d.nombre, etiqueta: d.nombre }))}
              onChange={setZona}
            />
            <FiltroDesplegable
              etiqueta="Precio"
              placeholder="Cualquier precio"
              valor={precioMax}
              opciones={[
                { valor: '30', etiqueta: 'Hasta $30' },
                { valor: '40', etiqueta: 'Hasta $40' },
                { valor: '50', etiqueta: 'Hasta $50' },
                { valor: '80', etiqueta: 'Hasta $80' },
              ]}
              onChange={setPrecioMax}
            />
            <button
              type="button"
              onClick={() => { setBusqueda(''); setCategoria(''); setZona(''); setTipo(''); setPrecioMax('') }}
              className="w-full cursor-pointer rounded-xl border-2 border-dashed border-verde-bosque px-4 py-2.5 text-sm font-semibold text-verde-bosque transition-colors hover:border-verde-bosque hover:bg-verde-bosque hover:text-white sm:w-auto"
            >
              Limpiar filtros
            </button>
          </div>
        </div>

        {cargando ? (
          <LoadingIguana fullscreen message="Cargando publicaciones…" />
        ) : visibles.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-xl border-2 border-dashed border-cafe-claro bg-white/60 text-cafe">
            <p className="px-6 text-center">
              <span className="block text-lg font-semibold text-verde-bosque">No se encontraron publicaciones</span>
              {busqueda || categoria || zona || tipo || precioMax
                ? 'Prueba cambiando los filtros de búsqueda.'
                : 'Crea la primera publicación desde el panel del operador.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((e) => (
              <ExperienceCard key={e.id} experiencia={e} proximaFecha={e.proximaFecha} />
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
