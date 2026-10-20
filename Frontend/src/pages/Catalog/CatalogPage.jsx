import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { getContentLocale } from '../../i18n/config.js'
import { getCategorias, getDepartamentos, getExperiencias, getProximasExperiencias } from '../../services/experiencias.js'
import { getResumenResenas } from '../../services/resenas.js'
import imagenHero from '../../assets/EL-TUNCO.jpg'
import ExperienceCard from '../../components/ExperienceCard.jsx'
import LoadingIguana from '../../components/LoadingIguana.jsx'

// Cuántas próximas experiencias se piden y se muestran; el subtítulo de la
// sección las interpola desde el recurso (AD-3), nunca por concatenación.
const PROXIMAS_LIMITE = 3

// Filtro desplegable con la estetica del sitio: pastilla redondeada con borde
// cafe, panel de opciones estilo tarjeta (hover crema, seleccion verde-bosque
// con tilde). Cierra con Escape o clic fuera. Sustituye al <select> nativo.
function FiltroDesplegable({ etiqueta, placeholder, valor, opciones, onChange }) {
  const { t, i18n } = useTranslation('catalog')
  const contentLocale = getContentLocale(i18n.resolvedLanguage || i18n.language)
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
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-full border-2 bg-white px-4 py-2.5 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 ${
          valor
            ? 'border-verde-bosque text-verde-bosque'
            : 'border-verde-bosque text-neutral-700 hover:border-verde-hoja'
        }`}
      >
        <span className="min-w-0 truncate">
          <span className="mr-1.5 text-xs font-bold opacity-70">{etiqueta}</span>
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
          aria-label={t('filters.optionsFor', { label: etiqueta })}
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-auto rounded-[22px] border border-neutral-200 bg-white p-1.5"
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
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-full px-3.5 py-2.5 text-left text-sm transition-colors ${
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
  const { t, i18n } = useTranslation('catalog')
  const contentLocale = getContentLocale(i18n.resolvedLanguage || i18n.language)
  const [categorias, setCategorias] = useState([])
  const [departamentos, setDepartamentos] = useState([])
  const [experiencias, setExperiencias] = useState([])
  const [proximasExperiencias, setProximasExperiencias] = useState([])
  const [cargando, setCargando] = useState(true)
  // La lista de publicaciones y las opciones de filtro se cargan por separado:
  // cada fallo lleva su propio estado, y ambos comparten el mismo bloque de error.
  const [error, setError] = useState(false)
  const [errorFiltros, setErrorFiltros] = useState(false)
  const [reintento, setReintento] = useState(0)
  // La pantalla de carga completa solo se muestra la primera vez que se entra.
  // Al cambiar filtros o escribir en el buscador la lista se actualiza sin tapar la pantalla.
  const primeraCarga = useRef(true)

  // El estado de filtros y búsqueda vive en la URL: así el catálogo filtrado
  // es enlazable, sobrevive a la recarga y funciona con Atrás/Adelante. La URL
  // es la única fuente de verdad y los valores vacíos no se escriben.
  const [searchParams, setSearchParams] = useSearchParams()
  const busqueda = searchParams.get('q') ?? ''
  const categoria = searchParams.get('categoria') ?? ''
  const zona = searchParams.get('zona') ?? ''
  const tipo = searchParams.get('tipo') ?? ''
  const precioMax = searchParams.get('precio') ?? ''
  const orden = searchParams.get('orden') ?? ''

  // Escribir en el buscador reemplaza la entrada actual (no llena el historial);
  // elegir un filtro empuja una entrada nueva para que Atrás restaure el anterior.
  const actualizarFiltro = (clave, valor, opciones) => {
    setSearchParams((previos) => {
      const siguiente = new URLSearchParams(previos)
      if (valor) siguiente.set(clave, valor)
      else siguiente.delete(clave)
      return siguiente
    }, opciones)
  }

  const limpiarFiltros = () => {
    setSearchParams((previos) => {
      const siguiente = new URLSearchParams(previos)
      ;['q', 'categoria', 'zona', 'tipo', 'precio', 'orden'].forEach((clave) => siguiente.delete(clave))
      return siguiente
    })
  }

  // Mapa publicacionId -> { promedio, total }. Publicaciones sin reseñas no
  // vienen en la respuesta y la tarjeta muestra "Aún no tiene reseñas".
  const [resumenes, setResumenes] = useState({})
  // En móvil los filtros van ocultos tras un botón "Filtros" hasta que se abre.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const filtrosActivos = [tipo, categoria, zona, precioMax].filter(Boolean).length

  useEffect(() => {
    getCategorias().then(setCategorias).catch(() => setErrorFiltros(true))
    getDepartamentos().then(setDepartamentos).catch(() => setErrorFiltros(true))
  }, [reintento])

  useEffect(() => {
    let activo = true
    if (primeraCarga.current) setCargando(true)

    getExperiencias({ search: busqueda, categoria, zona, tipo, precioMax, locale: contentLocale })
      .then((datos) => { if (activo) { setExperiencias(datos); setError(false) } })
      .catch(() => { if (activo) setError(true) })
      .finally(() => {
        if (primeraCarga.current) {
          primeraCarga.current = false
          setCargando(false)
        }
      })

    return () => { activo = false }
  }, [busqueda, categoria, zona, tipo, precioMax, contentLocale, reintento])

  useEffect(() => {
    getProximasExperiencias(PROXIMAS_LIMITE, contentLocale)
      .then(setProximasExperiencias)
      .catch(() => setProximasExperiencias([]))
  }, [contentLocale])

  // Batch de promedios: una sola llamada con los ids visibles (catálogo + próximas).
  useEffect(() => {
    const ids = [...new Set([...experiencias, ...proximasExperiencias].map((e) => e.id))]
    if (ids.length === 0) {
      setResumenes({})
      return undefined
    }
    let activo = true
    getResumenResenas(ids)
      .then((data) => { if (activo) setResumenes(data || {}) })
      .catch(() => { if (activo) setResumenes({}) })
    return () => { activo = false }
  }, [experiencias, proximasExperiencias])

  const hayFiltros = Boolean(busqueda || categoria || zona || tipo || precioMax || orden)
  const visibles = useMemo(() => {
    if (orden === 'valoradas') {
      return [...experiencias].sort((a, b) => {
        const ra = resumenes[a.id]?.total > 0 ? resumenes[a.id].promedio : -1
        const rb = resumenes[b.id]?.total > 0 ? resumenes[b.id].promedio : -1
        return rb - ra
      })
    }
    return hayFiltros ? experiencias : aleatorias(experiencias, 6)
  }, [experiencias, hayFiltros, orden, resumenes])

  const handleBuscar = (e) => {
    e.preventDefault()
  }

  const reintentar = () => {
    setError(false)
    setErrorFiltros(false)
    setReintento((n) => n + 1)
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-verde-bosque text-white">
        <img
          src={imagenHero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:py-24">
          <h1 className="text-3xl font-extrabold sm:text-5xl">
            <Trans i18nKey="hero.title" ns="catalog" components={{ green: <span className="text-verde-hoja" /> }} />
          </h1>
          <p className="mt-3 max-w-2xl text-base text-crema/85 sm:text-lg">
            {t('hero.subtitle')}
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
                onChange={(e) => actualizarFiltro('q', e.target.value, { replace: true })}
                aria-label={t('search.label')}
                placeholder={t('search.placeholder')}
                className="w-full rounded-full border-2 border-verde-bosque bg-white py-3 pl-11 pr-4 text-neutral-800 placeholder:text-neutral-500 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="rounded-full bg-iguana-hondo px-6 py-3 font-semibold text-white hover:bg-verde-bosque transition-colors sm:w-auto"
            >
              {t('search.button')}
            </button>
          </form>
        </div>
      </section>

      {/* Filtros y listado */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 rounded-[22px] border border-verde-bosque/30 bg-white p-4 sm:p-5">
          {/* Botón tipo menú de filtros: visible SOLO en móvil, colapsa/expande los controles */}
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((prev) => !prev)}
            aria-expanded={filtrosAbiertos}
            aria-controls="filtros-controles"
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-full border-2 border-verde-bosque bg-verde-bosque/5 px-4 py-3 text-sm font-bold text-verde-bosque transition-colors hover:bg-verde-bosque/10 focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 sm:hidden"
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
              {filtrosActivos > 0 ? t('filters.buttonCount', { n: filtrosActivos }) : t('filters.button')}
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

          <p className="mb-3 hidden text-xs font-bold text-verde-bosque sm:block">{t('filters.heading')}</p>

          <div
            id="filtros-controles"
            className={`${filtrosAbiertos ? 'flex' : 'hidden'} mt-3 flex-col gap-3 sm:mt-0 sm:flex sm:flex-row sm:flex-wrap sm:items-center`}
          >
            {/* Tipo: control segmentado con la paleta del sitio */}
            <div
              role="group"
              aria-label={t('filters.typeGroup')}
              className="flex w-full flex-nowrap items-center gap-1 rounded-full border-2 border-verde-bosque bg-verde-bosque/5 p-1.5 sm:w-fit sm:flex-none"
            >
              {[
                { valor: '', etiqueta: t('type.all') },
                { valor: 'experiencia', etiqueta: t('type.experiences') },
                { valor: 'hospedaje', etiqueta: t('type.stays') },
              ].map((op) => (
                <button
                  key={op.valor || 'todos'}
                  type="button"
                  onClick={() => actualizarFiltro('tipo', op.valor)}
                  aria-pressed={tipo === op.valor}
                  className={`flex-none cursor-pointer whitespace-nowrap rounded-full px-1.5 py-1.5 text-xs transition-colors sm:px-2.5 sm:text-sm ${
                    tipo === op.valor
                      ? 'bg-verde-bosque font-semibold text-white'
                      : 'text-verde-bosque hover:bg-white'
                  }`}
                >
                  {op.etiqueta}
                </button>
              ))}
            </div>

            <FiltroDesplegable
              etiqueta={t('filters.categoryLabel')}
              placeholder={t('filters.categoryPlaceholder')}
              valor={categoria}
              opciones={categorias.map((c) => ({ valor: c, etiqueta: c }))}
              onChange={(valor) => actualizarFiltro('categoria', valor)}
            />
            <FiltroDesplegable
              etiqueta={t('filters.zoneLabel')}
              placeholder={t('filters.zonePlaceholder')}
              valor={zona}
              opciones={departamentos.map((d) => ({ valor: d.nombre, etiqueta: d.nombre }))}
              onChange={(valor) => actualizarFiltro('zona', valor)}
            />
            <FiltroDesplegable
              etiqueta={t('filters.priceLabel')}
              placeholder={t('filters.pricePlaceholder')}
              valor={precioMax}
              opciones={[30, 40, 50, 80].map((max) => ({
                valor: String(max),
                etiqueta: t('filters.priceUpTo', { max }),
              }))}
              onChange={(valor) => actualizarFiltro('precio', valor)}
            />
            <FiltroDesplegable
              etiqueta={t('filters.sortLabel')}
              placeholder={t('filters.sortPlaceholder')}
              valor={orden}
              opciones={[{ valor: 'valoradas', etiqueta: t('filters.sortBestRated') }]}
              onChange={(valor) => actualizarFiltro('orden', valor)}
            />
            {hayFiltros && (
              <div className="flex w-full justify-center">
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="w-fit cursor-pointer whitespace-nowrap rounded-full border-2 border-dashed border-verde-bosque px-4 py-2.5 text-sm font-semibold text-verde-bosque transition-colors hover:border-verde-bosque hover:bg-verde-bosque hover:text-white"
                >
                  {t('filters.clear')}
                </button>
              </div>
            )}
          </div>
        </div>

        {cargando ? (
          <LoadingIguana fullscreen message={t('status.loading')} />
        ) : error || errorFiltros ? (
          <div
            role="alert"
            className="flex h-72 flex-col items-center justify-center gap-4 rounded-[22px] border-2 border-dashed border-red-200 bg-red-50/60 px-6 text-center"
          >
            <p className="text-lg font-semibold text-red-700">{t('status.error')}</p>
            <button
              type="button"
              onClick={reintentar}
              className="cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
            >
              {t('status.retry')}
            </button>
          </div>
        ) : visibles.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-[22px] border-2 border-dashed border-cafe-claro bg-white/60 text-cafe">
            <p className="px-6 text-center">
              <span className="block text-lg font-semibold text-verde-bosque">{t('status.emptyTitle')}</span>
              {busqueda || categoria || zona || tipo || precioMax
                ? t('status.emptyWithFilters')
                : t('status.emptyNoContent')}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((e) => (
              <ExperienceCard
                key={e.id}
                experiencia={e}
                proximaFecha={e.proximaFecha}
                resena={resumenes[e.id]}
              />
            ))}
          </div>
        )}
      </section>

      {/* Próximas experiencias */}
      {proximasExperiencias.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-14">
          <div className="rounded-[22px] border border-verde-hoja/30 bg-cafe-claro p-6 sm:p-8">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-verde-bosque">
                  {t('upcoming.title')}
                </h2>
                <p className="mt-1 text-sm text-cafe">
                  {t('upcoming.subtitle', { count: proximasExperiencias.length })}
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {proximasExperiencias.map((e) => (
                <ExperienceCard
                  key={e.id}
                  experiencia={e}
                  proximaFecha={e.proximaFecha}
                  resena={resumenes[e.id]}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
