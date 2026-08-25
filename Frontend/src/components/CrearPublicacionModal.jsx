import { useEffect, useState } from 'react'
import { api } from '../services/api.js'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40'
const labelCls = 'block text-sm font-semibold text-cafe-oscuro mb-1'

export default function CrearPublicacionModal({ abierto, onCerrar, onCreada }) {
  const [categorias, setCategorias] = useState([])
  const [anfitriones, setAnfitriones] = useState([])
  const [amenidades, setAmenidades] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [anfitrionId, setAnfitrionId] = useState('')
  const [precio, setPrecio] = useState('')
  const [capacidad, setCapacidad] = useState('')
  const [habitaciones, setHabitaciones] = useState('')
  const [camas, setCamas] = useState('')
  const [banos, setBanos] = useState('')
  const [direccion, setDireccion] = useState('')
  const [latitud, setLatitud] = useState('')
  const [longitud, setLongitud] = useState('')
  const [tipo, setTipo] = useState('hospedaje')
  const [expNombre, setExpNombre] = useState('')
  const [expDuracion, setExpDuracion] = useState('')
  const [expPrecio, setExpPrecio] = useState('')
  const [amenidadIds, setAmenidadIds] = useState([])
  const [archivos, setArchivos] = useState([])
  const [horarios, setHorarios] = useState([{ diaSemana: 1, horaInicio: '08:00', horaFin: '17:00' }])

  useEffect(() => {
    if (!abierto) return
    api.get('/Categoria').then(setCategorias).catch(() => {})
    api.get('/Anfitrione').then(setAmenid => { setAnfitriones(amenid) }).catch(() => {})
    api.get('/Amenidade').then(setAmenidades).catch(() => {})
  }, [abierto])

  const toggleAmenidad = (id) => {
    setAmenidadIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const subirArchivos = async () => {
    const urls = []
    for (const archivo of archivos) {
      const ext = archivo.name.split('.').pop()
      const nombre = `publicaciones/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const res = await fetch(`/api/Imagenes/upload?fileName=${encodeURIComponent(nombre)}`, {
        method: 'POST',
        headers: { 'Content-Type': archivo.type },
        body: archivo,
      })
      if (res.ok) urls.push(await res.json())
    }
    return urls
  }

  const actualizarHorario = (i, campo, valor) => {
    setHorarios((prev) => prev.map((h, idx) => idx === i ? { ...h, [campo]: valor } : h))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      const experienciaData = tipo === 'experiencia' && expNombre
        ? { nombre: expNombre, duracionHoras: expDuracion ? parseInt(expDuracion) : null, precioAdicional: expPrecio ? parseFloat(expPrecio) : null }
        : null

      const publicacion = {
        titulo,
        descripcion: descripcion || null,
        categoriaId: parseInt(categoriaId),
        anfitrionId: parseInt(anfitrionId),
        precioPorNoche: parseFloat(precio),
        capacidadMaxima: parseInt(capacidad),
        habitaciones: habitaciones ? parseInt(habitaciones) : null,
        camas: camas ? parseInt(camas) : null,
        banos: banos ? parseInt(banos) : null,
        direccionExacta: direccion || null,
        latitud: latitud ? parseFloat(latitud) : null,
        longitud: longitud ? parseFloat(longitud) : null,
        estado: 'activo',
        experiencia: experienciaData,
        horarios: horarios.map((h) => ({
          diaSemana: parseInt(h.diaSemana),
          horaInicio: h.horaInicio,
          horaFin: h.horaFin,
        })),
        amenidadIds: amenidadIds,
      }

      const res = await api.post('/Publicacione', publicacion)
      const pubId = res.id

      if (archivos.length > 0) {
        const urls = await subirArchivos()
        for (let i = 0; i < urls.length; i++) {
          await api.post('/ImagenesPublicacion', {
            publicacionId: pubId,
            url: urls[i],
            esPrincipal: i === 0,
          })
        }
      }

      onCreada()
    } catch (err) {
      setError(err.message || 'Error al crear la publicación')
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-crema shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cafe-claro/30 bg-crema px-6 py-4">
          <h2 className="text-xl font-bold text-verde-bosque">Crear publicación</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="cursor-pointer rounded-lg p-1 text-cafe transition-colors hover:bg-cafe/10 hover:text-cafe-oscuro"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {/* Información básica */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Información básica</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Título *</label>
                <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ej: Clases de surf en El Tunco" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Descripción</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputCls + ' h-20 resize-none'} placeholder="Describe la experiencia..." />
              </div>
              <div>
                <label className={labelCls}>Categoría *</label>
                <select required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Anfitrión *</label>
                <select required value={anfitrionId} onChange={(e) => setAnfitrionId(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {anfitriones.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Precio por noche (USD) *</label>
                <input required type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Capacidad máxima *</label>
                <input required type="number" min="1" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} className={inputCls} placeholder="Número de personas" />
              </div>
            </div>
          </fieldset>

          {/* Ubicación y detalles */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Ubicación y detalles</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Dirección exacta</label>
                <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} placeholder="Dirección completa" />
              </div>
              <div>
                <label className={labelCls}>Latitud</label>
                <input type="number" step="any" value={latitud} onChange={(e) => setLatitud(e.target.value)} className={inputCls} placeholder="13.6929" />
              </div>
              <div>
                <label className={labelCls}>Longitud</label>
                <input type="number" step="any" value={longitud} onChange={(e) => setLongitud(e.target.value)} className={inputCls} placeholder="-89.2182" />
              </div>
              <div>
                <label className={labelCls}>Habitaciones</label>
                <input type="number" min="0" value={habitaciones} onChange={(e) => setHabitaciones(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Camas</label>
                <input type="number" min="0" value={camas} onChange={(e) => setCamas(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Baños</label>
                <input type="number" min="0" value={banos} onChange={(e) => setBanos(e.target.value)} className={inputCls} />
              </div>
            </div>
          </fieldset>

          {/* Tipo */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Tipo</legend>
            <div className="flex gap-6 mb-4">
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input type="radio" name="tipo" value="hospedaje" checked={tipo === 'hospedaje'} onChange={(e) => setTipo(e.target.value)} className="accent-verde-bosque" />
                Hospedaje
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input type="radio" name="tipo" value="experiencia" checked={tipo === 'experiencia'} onChange={(e) => setTipo(e.target.value)} className="accent-verde-bosque" />
                Experiencia
              </label>
            </div>
            {tipo === 'experiencia' && (
              <div className="grid gap-4 rounded-lg border border-verde-hoja/30 bg-verde-hoja/5 p-4 sm:grid-cols-3">
                <div className="sm:col-span-1">
                  <label className={labelCls}>Nombre experiencia</label>
                  <input value={expNombre} onChange={(e) => setExpNombre(e.target.value)} className={inputCls} placeholder="Ej: Surf" />
                </div>
                <div>
                  <label className={labelCls}>Duración (horas)</label>
                  <input type="number" min="1" value={expDuracion} onChange={(e) => setExpDuracion(e.target.value)} className={inputCls} placeholder="2" />
                </div>
                <div>
                  <label className={labelCls}>Precio adicional</label>
                  <input type="number" min="0" step="0.01" value={expPrecio} onChange={(e) => setExpPrecio(e.target.value)} className={inputCls} placeholder="0.00" />
                </div>
              </div>
            )}
          </fieldset>

          {/* Amenidades */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Amenidades</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {amenidades.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 transition-colors hover:border-verde-hoja cursor-pointer">
                  <input
                    type="checkbox"
                    checked={amenidadIds.includes(a.id)}
                    onChange={() => toggleAmenidad(a.id)}
                    className="accent-verde-bosque"
                  />
                  {a.nombre}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Imágenes */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Imágenes</legend>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setArchivos((prev) => [...prev, ...Array.from(e.target.files)])}
              className="block w-full text-sm text-cafe file:mr-4 file:rounded-lg file:border-0 file:bg-terracota file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:cursor-pointer hover:file:bg-terracota/90"
            />
            {archivos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-3">
                {archivos.map((a, i) => (
                  <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-neutral-200">
                    <img src={URL.createObjectURL(a)} alt="" className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute top-0 left-0 rounded-br bg-verde-bosque px-1.5 py-0.5 text-[10px] font-bold text-white">Principal</span>}
                    <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 rounded-full bg-red-600 p-0.5 text-white hover:bg-red-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          {/* Horarios */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Horarios</legend>
            <div className="space-y-3">
              {horarios.map((h, i) => (
                <div key={i} className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className={labelCls}>Día</label>
                    <select value={h.diaSemana} onChange={(e) => actualizarHorario(i, 'diaSemana', e.target.value)} className={inputCls}>
                      {DIAS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Hora inicio</label>
                    <input type="time" value={h.horaInicio} onChange={(e) => actualizarHorario(i, 'horaInicio', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Hora fin</label>
                    <input type="time" value={h.horaFin} onChange={(e) => actualizarHorario(i, 'horaFin', e.target.value)} className={inputCls} />
                  </div>
                  {horarios.length > 1 && (
                    <button type="button" onClick={() => setHorarios((prev) => prev.filter((_, j) => j !== i))} className="cursor-pointer rounded-lg bg-red-50 p-2 text-red-500 hover:bg-red-100">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setHorarios((prev) => [...prev, { diaSemana: 1, horaInicio: '08:00', horaFin: '17:00' }])}
              className="mt-3 cursor-pointer text-sm font-semibold text-terracota hover:text-terracota/80"
            >
              + Agregar horario
            </button>
          </fieldset>

          {/* Botones */}
          <div className="flex justify-end gap-3 border-t border-cafe-claro/30 pt-4">
            <button type="button" onClick={onCerrar} className="cursor-pointer rounded-lg border border-cafe-claro bg-white px-5 py-2.5 text-sm font-semibold text-cafe-oscuro transition-colors hover:bg-neutral-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="cursor-pointer rounded-lg bg-verde-bosque px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque/90 disabled:opacity-50"
            >
              {enviando ? 'Creando...' : 'Crear publicación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
