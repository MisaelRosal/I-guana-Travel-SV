import { useEffect, useState } from 'react'
import { api } from '../services/api.js'
import LocationPicker from './LocationPicker.jsx'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40'
const labelCls = 'block text-sm font-semibold text-cafe-oscuro mb-1'

export default function CrearPublicacionModal({ abierto, onCerrar, onCreada }) {
  const [categorias, setCategorias] = useState([])
  const [anfitriones, setAnfitriones] = useState([])
  const [amenidades, setAmenidades] = useState([])
  const [departamentos, setDepartamentos] = useState([])
  const [allMunicipios, setAllMunicipios] = useState([])
  const [municipios, setMunicipios] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [confirmarSalida, setConfirmarSalida] = useState(false)

  const [tipo, setTipo] = useState('hospedaje')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [anfitrionId, setAnfitrionId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [precio, setPrecio] = useState('')
  const [capacidad, setCapacidad] = useState('')
  const [habitaciones, setHabitaciones] = useState('')
  const [camas, setCamas] = useState('')
  const [banos, setBanos] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [municipioId, setMunicipioId] = useState('')
  const [latitud, setLatitud] = useState('')
  const [longitud, setLongitud] = useState('')
  const [amenidadIds, setAmenidadIds] = useState([])
  const [archivos, setArchivos] = useState([])
  const [horarios, setHorarios] = useState([{ diaSemana: 1, horaInicio: '08:00', horaFin: '17:00' }])

  useEffect(() => {
    if (!abierto) return
    api.get('/Categoria').then(setCategorias).catch(() => {})
    api.get('/Anfitrione').then(setAnfitriones).catch(() => {})
    api.get('/Amenidade').then(setAmenidades).catch(() => {})
    api.get('/Departamento').then(setDepartamentos).catch(() => {})
    api.get('/Municipio').then(setAllMunicipios).catch(() => {})
  }, [abierto])

  useEffect(() => {
    if (!departamentoId) { setMunicipios([]); return }
    setMunicipios(allMunicipios.filter((m) => m.departamentoId === parseInt(departamentoId)))
  }, [departamentoId, allMunicipios])

  useEffect(() => {
    if (!abierto) return
    setTipo('hospedaje')
    setTitulo('')
    setDescripcion('')
    setAnfitrionId('')
    setCategoriaId('')
    setPrecio('')
    setCapacidad('')
    setHabitaciones('')
    setCamas('')
    setBanos('')
    setDepartamentoId('')
    setMunicipioId('')
    setLatitud('')
    setLongitud('')
    setAmenidadIds([])
    setArchivos([])
    setHorarios([{ diaSemana: 1, horaInicio: '08:00', horaFin: '17:00' }])
    setError(null)
  }, [abierto])

  const toggleAmenidad = (id) => {
    setAmenidadIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const subirArchivos = async () => {
    const urls = []
    for (const archivo of archivos) {
      const formData = new FormData()
      formData.append('file', archivo)
      const res = await fetch('/api/Imagenes/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          data.forEach((item) => { if (item.url) urls.push(item.url) })
        } else if (data.url) {
          urls.push(data.url)
        }
      }
    }
    return urls
  }

  const actualizarHorario = (i, campo, valor) => {
    setHorarios((prev) => prev.map((h, idx) => idx === i ? { ...h, [campo]: valor } : h))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!latitud || !longitud) {
      setError('Por favor seleccioná una ubicación en el mapa')
      setEnviando(false)
      return
    }
    setEnviando(true)
    try {
      const publicacion = {
        titulo,
        descripcion: descripcion || null,
        categoriaId: parseInt(categoriaId),
        anfitrionId: parseInt(anfitrionId),
        precioPorNoche: parseFloat(precio),
        capacidadMaxima: parseInt(capacidad),
        latitud: parseFloat(latitud),
        longitud: parseFloat(longitud),
        estado: 'activo',
      }

      if (tipo === 'hospedaje') {
        publicacion.habitaciones = habitaciones ? parseInt(habitaciones) : null
        publicacion.camas = camas ? parseInt(camas) : null
        publicacion.banos = banos ? parseInt(banos) : null
        publicacion.amenidadIds = amenidadIds
        publicacion.horarios = []
      } else {
        publicacion.habitaciones = null
        publicacion.camas = null
        publicacion.banos = null
        publicacion.amenidadIds = []
        publicacion.experiencia = [{ nombre: titulo, duracionHoras: null, precioAdicional: null }]
        publicacion.horarios = horarios.map((h) => ({
          diaSemana: parseInt(h.diaSemana),
          horaInicio: h.horaInicio,
          horaFin: h.horaFin,
        }))
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

  const tieneDatos = () => {
    return titulo || descripcion || anfitrionId || categoriaId || precio || capacidad ||
      habitaciones || camas || banos || departamentoId || municipioId ||
      latitud || longitud || amenidadIds.length > 0 || archivos.length > 0 ||
      horarios.length > 1 || (horarios[0] && (horarios[0].horaInicio !== '08:00' || horarios[0].horaFin !== '17:00'))
  }

  const handleCerrar = () => {
    if (tieneDatos()) {
      setConfirmarSalida(true)
    } else {
      onCerrar()
    }
  }

  const confirmarCierre = () => {
    setConfirmarSalida(false)
    onCerrar()
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-crema shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cafe-claro/30 bg-crema px-6 py-4">
          <h2 className="text-xl font-bold text-verde-bosque">Crear publicación</h2>
          <button
            type="button"
            onClick={handleCerrar}
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

          {/* Tipo de publicación */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">¿Qué querés publicar?</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center justify-center gap-3 rounded-xl border-2 px-4 py-5 text-sm font-semibold transition-all cursor-pointer ${
                tipo === 'hospedaje'
                  ? 'border-verde-bosque bg-verde-bosque/10 text-verde-bosque shadow-sm'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-verde-hoja/50'
              }`}>
                <input type="radio" name="tipo" value="hospedaje" checked={tipo === 'hospedaje'} onChange={(e) => setTipo(e.target.value)} className="sr-only" />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
                  <path d="M3 21V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14" />
                  <path d="M13 21V11a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v10" />
                  <path d="M3 21h18" />
                  <path d="M7 9h2M7 13h2" />
                </svg>
                Hospedaje
              </label>
              <label className={`flex items-center justify-center gap-3 rounded-xl border-2 px-4 py-5 text-sm font-semibold transition-all cursor-pointer ${
                tipo === 'experiencia'
                  ? 'border-terracota bg-terracota/10 text-terracota shadow-sm'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:border-terracota/50'
              }`}>
                <input type="radio" name="tipo" value="experiencia" checked={tipo === 'experiencia'} onChange={(e) => setTipo(e.target.value)} className="sr-only" />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                Experiencia
              </label>
            </div>
          </fieldset>

          {/* Información básica */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Información básica</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Título *</label>
                <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder={tipo === 'hospedaje' ? 'Ej: Casa frente al mar en El Tunco' : 'Ej: Clases de surf en El Tunco'} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Descripción</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputCls + ' h-20 resize-none'} placeholder={tipo === 'hospedaje' ? 'Describe el alojamiento...' : 'Describe la experiencia...'} />
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
                <label className={labelCls}>Categoría *</label>
                <select required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{tipo === 'hospedaje' ? 'Precio por noche (USD) *' : 'Precio de la experiencia (USD) *'}</label>
                <input required type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Capacidad máxima *</label>
                <input required type="number" min="1" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} className={inputCls} placeholder="Personas" />
              </div>
            </div>
          </fieldset>

          {/* Ubicación */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">Ubicación</legend>
            <div className="mb-4">
              <LocationPicker
                departamentos={departamentos}
                municipios={allMunicipios}
                latitud={latitud}
                longitud={longitud}
                departamentoId={departamentoId}
                municipioId={municipioId}
                onLocationChange={(lat, lng) => { setLatitud(lat); setLongitud(lng) }}
                onDepartamentoChange={(id) => { setDepartamentoId(id); setMunicipioId('') }}
                onMunicipioChange={setMunicipioId}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Departamento *</label>
                <select required value={departamentoId} onChange={(e) => { setDepartamentoId(e.target.value); setMunicipioId('') }} className={inputCls}>
                  <option value="">Seleccionar...</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Municipio *</label>
                <select required value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} className={inputCls} disabled={!departamentoId}>
                  <option value="">{departamentoId ? 'Seleccionar...' : 'Primero elegí un departamento'}</option>
                  {municipios.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="hidden">
                <input type="number" step="any" value={latitud} onChange={(e) => setLatitud(e.target.value)} />
              </div>
              <div className="hidden">
                <input type="number" step="any" value={longitud} onChange={(e) => setLongitud(e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* Detalles del alojamiento - solo hospedaje */}
          {tipo === 'hospedaje' && (
            <fieldset className="mb-6">
              <legend className="mb-3 text-lg font-bold text-verde-bosque">Detalles del alojamiento</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>Habitaciones</label>
                  <input type="number" min="0" value={habitaciones} onChange={(e) => setHabitaciones(e.target.value)} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Camas</label>
                  <input type="number" min="0" value={camas} onChange={(e) => setCamas(e.target.value)} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Baños</label>
                  <input type="number" min="0" value={banos} onChange={(e) => setBanos(e.target.value)} className={inputCls} placeholder="0" />
                </div>
              </div>
            </fieldset>
          )}

          {/* Amenidades - solo hospedaje */}
          {tipo === 'hospedaje' && (
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
          )}

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

          {/* Horarios - solo experiencia */}
          {tipo === 'experiencia' && (
            <fieldset className="mb-6">
              <legend className="mb-3 text-lg font-bold text-verde-bosque">Horarios disponibles</legend>
              <p className="mb-3 text-sm text-cafe">Definí los días y horarios en que esta experiencia está disponible.</p>
              <div className="space-y-3">
                {horarios.map((h, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className={labelCls}>Día</label>
                      <select value={h.diaSemana} onChange={(e) => actualizarHorario(i, 'diaSemana', e.target.value)} className={inputCls}>
                        {DIAS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className={labelCls}>Hora inicio</label>
                      <input type="time" value={h.horaInicio} onChange={(e) => actualizarHorario(i, 'horaInicio', e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className={labelCls}>Hora fin</label>
                      <input type="time" value={h.horaFin} onChange={(e) => actualizarHorario(i, 'horaFin', e.target.value)} className={inputCls} />
                    </div>
                    {horarios.length > 1 && (
                      <button type="button" onClick={() => setHorarios((prev) => prev.filter((_, j) => j !== i))} className="cursor-pointer rounded-lg bg-red-50 p-2 text-red-500 hover:bg-red-100" title="Eliminar horario">
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
                + Agregar otro horario
              </button>
            </fieldset>
          )}

          {/* Botones */}
          <div className="flex justify-end gap-3 border-t border-cafe-claro/30 pt-4">
            <button type="button" onClick={handleCerrar} className="cursor-pointer rounded-lg border border-cafe-claro bg-white px-5 py-2.5 text-sm font-semibold text-cafe-oscuro transition-colors hover:bg-neutral-50">
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

      {confirmarSalida && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-crema p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-verde-bosque">¿Estás seguro de salir?</h3>
            <p className="mb-5 text-sm text-cafe">Todos los datos del formulario se eliminarán.</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmarSalida(false)}
                className="cursor-pointer rounded-lg border border-cafe-claro bg-white px-4 py-2 text-sm font-semibold text-cafe-oscuro transition-colors hover:bg-neutral-50"
              >
                Quedarme
              </button>
              <button
                type="button"
                onClick={confirmarCierre}
                className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Sí, salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
