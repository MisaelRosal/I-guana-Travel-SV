import { useEffect, useState } from 'react'
import { getCategorias, getDepartamentos } from '../../services/experiencias.js'

const clasesSelect =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul-cielo/40'

export default function CatalogPage() {
  const [categorias, setCategorias] = useState([])
  const [departamentos, setDepartamentos] = useState([])

  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const [zona, setZona] = useState('')
  const [tipo, setTipo] = useState('')
  const [precioMax, setPrecioMax] = useState('')

  useEffect(() => {
    getCategorias().then(setCategorias)
    getDepartamentos().then(setDepartamentos)
  }, [])

  const imagenHero = departamentos[0]?.imagen

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-verde-bosque text-white">
        <img
          src={imagenHero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <h1 className="text-4xl font-extrabold sm:text-5xl">
            Descubrí las experiencias de <span className="text-verde-hoja">El Salvador</span>
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-crema/85">
            Surf, café, volcanes y pueblos con encanto. Explorá, reservá y viví el país con
            anfitriones locales.
          </p>
          <form className="mt-8 flex max-w-2xl gap-2">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o descripción…"
              className="flex-1 rounded-lg border-0 px-4 py-3 text-neutral-800 shadow placeholder:text-white focus:outline-none focus:ring-2 focus:ring-verde-hoja"
            />
            <button
              type="submit"
              className="rounded-lg bg-terracota px-6 py-3 font-semibold text-white hover:bg-verde-hoja transition-colors"
            >
              Buscar
            </button>
          </form>
        </div>
      </section>

      {/* Filtros y listado */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
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
            className="rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white hover:bg-azul-cielo transition-colors"
          >
            Filtrar
          </button>
        </div>

        <div className="flex h-72 items-center justify-center rounded-xl border-2 border-dashed border-cafe-claro bg-white/60 text-cafe">
          <p className="px-6 text-center">
            <span className="block text-lg font-semibold text-verde-bosque">Listado de experiencias</span>
            El listado de tarjetas se integrará con el backend.
          </p>
        </div>
      </section>
    </div>
  )
}