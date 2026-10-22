import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { formatDayMonthShort, formatMonthYear, weekdayShortMonFirst } from '../i18n/format.js'
import { api, readCsrfToken } from '../services/api.js'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import LocationPicker from './LocationPicker.jsx'

const inputCls = 'w-full rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40'
const labelCls = 'block text-sm font-semibold text-verde-bosque mb-1'

export default function CrearPublicacionModal({ abierto, onCerrar, onCreada, pubExistente, esEdicion, anfitrionFijo }) {
  const { t } = useTranslation('experiencia')
  const locale = useFormatLocale()
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
  const [horaEntrada, setHoraEntrada] = useState('')
  const [horaSalida, setHoraSalida] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [municipioId, setMunicipioId] = useState('')
  const [latitud, setLatitud] = useState('')
  const [longitud, setLongitud] = useState('')
  const [amenidadIds, setAmenidadIds] = useState([])
  const [archivos, setArchivos] = useState([])
  const [imagenesExistentes, setImagenesExistentes] = useState([])
  const [imagenesAEliminar, setImagenesAEliminar] = useState([])
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState([])
  const [fechasOriginalesExp, setFechasOriginalesExp] = useState([])
  const [horaInicioExp, setHoraInicioExp] = useState('08:00')
  const [horaFinExp, setHoraFinExp] = useState('17:00')
  const [mesCal, setMesCal] = useState(() => new Date().getMonth())
  const [anioCal, setAnioCal] = useState(() => new Date().getFullYear())

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
    if (esEdicion && pubExistente) {
      const tipoPub = pubExistente.tipo || (pubExistente.experiencia?.length > 0 ? 'experiencia' : 'hospedaje')
      setTipo(tipoPub)
      setTitulo(pubExistente.titulo || '')
      setDescripcion(pubExistente.descripcion || '')
      setAnfitrionId(pubExistente.anfitrionId != null ? String(pubExistente.anfitrionId) : '')
      setCategoriaId(pubExistente.categoriaId != null ? String(pubExistente.categoriaId) : '')
      setPrecio(pubExistente.precioPorNoche != null ? String(pubExistente.precioPorNoche) : '')
      setCapacidad(pubExistente.capacidadMaxima != null ? String(pubExistente.capacidadMaxima) : '')
      setHabitaciones(pubExistente.habitaciones != null ? String(pubExistente.habitaciones) : '')
      setCamas(pubExistente.camas != null ? String(pubExistente.camas) : '')
      setBanos(pubExistente.banos != null ? String(pubExistente.banos) : '')
      setHoraEntrada(pubExistente.horaEntrada || '')
      setHoraSalida(pubExistente.horaSalida || '')
      const municipio = pubExistente.municipio ?? pubExistente.anfitrion?.municipio
      setDepartamentoId(municipio?.departamentoId != null ? String(municipio.departamentoId) : '')
      setMunicipioId(municipio?.id != null ? String(municipio.id) : '')
      setLatitud(pubExistente.latitud != null ? String(pubExistente.latitud) : '')
      setLongitud(pubExistente.longitud != null ? String(pubExistente.longitud) : '')
      setAmenidadIds((pubExistente.publicacionAmenidads || []).map((pa) => pa.amenidadId))
      setArchivos([])
      setImagenesExistentes(
        (pubExistente.imagenesPublicacions || [])
          .slice()
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
      )
      setImagenesAEliminar([])
      const horariosPub = pubExistente.horarios || []
      const conFecha = horariosPub.filter((h) => h.fecha)
      const fechasOrig = conFecha.map((h) => String(h.fecha).slice(0, 10))
      setFechasSeleccionadas(fechasOrig)
      setFechasOriginalesExp(fechasOrig)
      setHoraInicioExp(conFecha[0]?.horaInicio?.slice(0, 5) || '08:00')
      setHoraFinExp(conFecha[0]?.horaFin?.slice(0, 5) || '17:00')
      setError(null)
      return
    }
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
    setHoraEntrada('')
    setHoraSalida('')
    setDepartamentoId('')
    setMunicipioId('')
    setLatitud('')
    setLongitud('')
    setAmenidadIds([])
    setArchivos([])
    setImagenesExistentes([])
    setImagenesAEliminar([])
    setFechasSeleccionadas([])
    setFechasOriginalesExp([])
    setHoraInicioExp('08:00')
    setHoraFinExp('17:00')
    setError(null)
  }, [abierto, esEdicion, pubExistente])

  useEffect(() => {
    if (!abierto || esEdicion || !anfitrionFijo) return
    setAnfitrionId(String(anfitrionFijo.id))
  }, [abierto, esEdicion, anfitrionFijo])

  const toggleAmenidad = (id) => {
    setAmenidadIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const quitarImagenExistente = (id) => {
    setImagenesExistentes((prev) => prev.filter((img) => img.id !== id))
    setImagenesAEliminar((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const subirArchivos = async () => {
    const urls = []
    for (const archivo of archivos) {
      const formData = new FormData()
      formData.append('file', archivo)
      const res = await fetch('/api/Imagenes/upload', {
        method: 'POST',
        // Direct fetch bypasses the api() helper, so attach the session cookie
        // and the CSRF header here (multipart body => no manual Content-Type).
        credentials: 'include',
        headers: { 'X-CSRF-Token': readCsrfToken() },
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

  // Edit-mode image reconciliation: delete the removed ones, upload the new
  // files, then normalize order so the first image stays principal.
  const sincronizarImagenes = async (publicacionId) => {
    const restantes = imagenesExistentes.filter((img) => !imagenesAEliminar.includes(img.id))
    for (const id of imagenesAEliminar) {
      await api.delete(`/ImagenesPublicacion/${id}`)
    }

    const creadas = []
    if (archivos.length > 0) {
      const urls = await subirArchivos()
      for (const url of urls) {
        const res = await api.post('/ImagenesPublicacion', {
          publicacionId,
          url,
          esPrincipal: false,
          orden: 0,
        })
        creadas.push({ id: res.id, url })
      }
    }

    const finales = [...restantes, ...creadas]
    for (let i = 0; i < finales.length; i++) {
      const img = finales[i]
      const debePrincipal = i === 0
      if (img.esPrincipal === debePrincipal && img.orden === i) continue
      await api.put(`/ImagenesPublicacion/${img.id}`, {
        publicacionId,
        url: img.url,
        esPrincipal: debePrincipal,
        orden: i,
      })
    }
  }

  const cambiarMesCal = (delta) => {
    let m = mesCal + delta
    let a = anioCal
    if (m < 0) { m = 11; a -= 1 }
    else if (m > 11) { m = 0; a += 1 }
    setMesCal(m)
    setAnioCal(a)
  }

  const fechaISO = (anio, mes, dia) =>
    `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

  const toggleFecha = (fecha) => {
    setFechasSeleccionadas((prev) => {
      if (prev.includes(fecha)) {
        if (esEdicion && tipo === 'experiencia' && fechasOriginalesExp.includes(fecha)) {
          return prev
        }
        return prev.filter((f) => f !== fecha)
      }
      return [...prev, fecha]
    })
  }

  const formatearFechaChip = (fecha) => formatDayMonthShort(fecha, locale)

  const celdasCalendario = () => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const primerDia = new Date(anioCal, mesCal, 1)
    const diasEnMes = new Date(anioCal, mesCal + 1, 0).getDate()
    const offset = (primerDia.getDay() + 6) % 7
    const celdas = []
    for (let i = 0; i < offset; i++) celdas.push({ dia: null })
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = fechaISO(anioCal, mesCal, d)
      celdas.push({
        dia: d,
        fecha,
        pasado: new Date(anioCal, mesCal, d).getTime() < hoy.getTime(),
        seleccionado: fechasSeleccionadas.includes(fecha),
      })
    }
    return celdas
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!latitud || !longitud) {
      setError(t('modal.errorLocation'))
      setEnviando(false)
      return
    }
    if (tipo === 'experiencia' && fechasSeleccionadas.length === 0) {
      setError(t('modal.errorDates'))
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
        tipo,
        precioPorNoche: parseFloat(precio),
        capacidadMaxima: parseInt(capacidad),
        latitud: parseFloat(latitud),
        longitud: parseFloat(longitud),
        municipioId: municipioId ? parseInt(municipioId) : null,
        estado: 'activo',
      }

      if (tipo === 'hospedaje') {
        publicacion.habitaciones = habitaciones ? parseInt(habitaciones) : null
        publicacion.camas = camas ? parseInt(camas) : null
        publicacion.banos = banos ? parseInt(banos) : null
        publicacion.amenidadIds = amenidadIds
        publicacion.horarios = horaEntrada || horaSalida
          ? [{ diaSemana: 0, horaInicio: horaEntrada, horaFin: horaSalida }]
          : []
      } else {
        publicacion.habitaciones = null
        publicacion.camas = null
        publicacion.banos = null
        publicacion.amenidadIds = []
        publicacion.experiencia = [{ nombre: titulo, duracionHoras: null, precioAdicional: null }]
        // Preserve the per-date availability set through the availability
        // manager: the PUT replaces every horario, so carry disponible/cupos.
        const previosPorFecha = new Map(
          (pubExistente?.horarios ?? [])
            .filter((h) => h.fecha)
            .map((h) => [String(h.fecha).slice(0, 10), h]),
        )
        publicacion.horarios = fechasSeleccionadas.map((fecha) => {
          const previo = previosPorFecha.get(fecha)
          return {
            fecha,
            horaInicio: horaInicioExp,
            horaFin: horaFinExp,
            disponible: previo ? previo.disponible !== false : true,
            cupos: previo?.cupos ?? null,
          }
        })
      }

      publicacion.publicacionAmenidads = amenidadIds.map((aid) => ({ amenidadId: aid }))

      if (esEdicion && pubExistente) {
        await api.put(`/Publicacione/${pubExistente.id}`, {
          ...publicacion,
          id: pubExistente.id,
        })

        await sincronizarImagenes(pubExistente.id)
      } else {
        const res = await api.post('/Publicacione', publicacion)
        const pubId = res.id

        if (archivos.length > 0) {
          const urls = await subirArchivos()
          for (let i = 0; i < urls.length; i++) {
            await api.post('/ImagenesPublicacion', {
              publicacionId: pubId,
              url: urls[i],
              esPrincipal: i === 0,
              orden: i,
            })
          }
        }
      }

      onCreada()
    } catch (err) {
      setError(esEdicion ? t('modal.errorUpdate') : err.message || t('modal.errorCreate'))
    } finally {
      setEnviando(false)
    }
  }

  const tieneDatos = () => {
    return titulo || descripcion || anfitrionId || categoriaId || precio || capacidad ||
      habitaciones || camas || banos || horaEntrada || horaSalida || departamentoId || municipioId ||
      latitud || longitud || amenidadIds.length > 0 || archivos.length > 0 ||
      imagenesAEliminar.length > 0 || fechasSeleccionadas.length > 0
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

  const refModal = useModalAccesible(handleCerrar, abierto)
  const refConfirmar = useModalAccesible(() => setConfirmarSalida(false), confirmarSalida)

  if (!abierto) return null

  return (
    <div
      ref={refModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="crear-publicacion-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[22px] bg-crema"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-cafe-claro/30 bg-crema px-4 py-4 sm:px-6">
          <h2 id="crear-publicacion-titulo" className="text-xl font-bold text-verde-bosque">{esEdicion ? t('modal.editTitle') : t('modal.createTitle')}</h2>
          <button
            type="button"
            onClick={handleCerrar}
            aria-label={t('common:modal.close')}
            className="cursor-pointer rounded-full p-1 text-cafe transition-colors hover:bg-cafe/10 hover:text-verde-bosque"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-[22px] border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {/* Tipo de publicación */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.typeLegend')}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`flex items-center justify-center gap-3 rounded-[22px] border-2 px-4 py-5 text-sm font-semibold transition-all ${
                esEdicion ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
                tipo === 'hospedaje'
                  ? 'border-verde-bosque bg-verde-bosque/10 text-verde-bosque'
                  : 'border-neutral-200 bg-white text-neutral-600' + (esEdicion ? '' : ' hover:border-verde-hoja/50')
              }`}>
                <input type="radio" name="tipo" value="hospedaje" checked={tipo === 'hospedaje'} onChange={(e) => setTipo(e.target.value)} disabled={esEdicion} className="sr-only" />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
                  <path d="M3 21V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14" />
                  <path d="M13 21V11a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v10" />
                  <path d="M3 21h18" />
                  <path d="M7 9h2M7 13h2" />
                </svg>
                {t('modal.stay')}
              </label>
              <label className={`flex items-center justify-center gap-3 rounded-[22px] border-2 px-4 py-5 text-sm font-semibold transition-all ${
                esEdicion ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
                tipo === 'experiencia'
                  ? 'border-iguana-hondo bg-iguana-hondo/10 text-iguana-hondo'
                  : 'border-neutral-200 bg-white text-neutral-600' + (esEdicion ? '' : ' hover:border-iguana-hondo/50')
              }`}>
                <input type="radio" name="tipo" value="experiencia" checked={tipo === 'experiencia'} onChange={(e) => setTipo(e.target.value)} disabled={esEdicion} className="sr-only" />
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {t('modal.experience')}
              </label>
            </div>
          </fieldset>

          {/* Información básica */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.basicLegend')}</legend>
            <p className="mb-4 rounded-[22px] border border-verde-hoja/30 bg-verde-hoja/10 px-3 py-2 text-sm text-verde-bosque">
              {t('modal.translationHint')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('modal.title')} *</label>
                <input required value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder={tipo === 'hospedaje' ? t('modal.titlePhStay') : t('modal.titlePhExp')} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('modal.description')}</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={inputCls + ' h-20 resize-none'} placeholder={tipo === 'hospedaje' ? t('modal.descPhStay') : t('modal.descPhExp')} />
              </div>
              <div>
                <label className={labelCls}>{t('modal.host')} *</label>
                {anfitrionFijo && !esEdicion ? (
                  <input
                    type="text"
                    value={anfitrionFijo.nombre}
                    disabled
                    className={inputCls + ' opacity-70'}
                  />
                ) : (
                  <select required value={anfitrionId} onChange={(e) => setAnfitrionId(e.target.value)} className={inputCls}>
                    <option value="">{t('modal.select')}</option>
                    {anfitriones.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className={labelCls}>{t('modal.category')} *</label>
                <select required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={inputCls}>
                  <option value="">{t('modal.select')}</option>
                  {categorias.filter((c) => c.tipo === tipo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{tipo === 'hospedaje' ? `${t('modal.priceStay')} *` : `${t('modal.priceExp')} *`}</label>
                <input required type="number" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={inputCls} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>{t('modal.capacity')} *</label>
                <input required type="number" min="1" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} className={inputCls} placeholder={t('modal.capacityPh')} />
              </div>
            </div>
          </fieldset>

          {/* Ubicación */}
          <fieldset className="mb-6">
            <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.locationLegend')}</legend>
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
                disabled={esEdicion && tipo === 'hospedaje'}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>{t('modal.department')} *</label>
                <select required value={departamentoId} onChange={(e) => { setDepartamentoId(e.target.value); setMunicipioId('') }} className={inputCls}>
                  <option value="">{t('modal.select')}</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('modal.municipality')} *</label>
                <select required value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} className={inputCls} disabled={!departamentoId}>
                  <option value="">{departamentoId ? t('modal.select') : t('modal.municipalityDisabled')}</option>
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
              <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.stayDetailsLegend')}</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={labelCls}>{t('modal.rooms')}</label>
                  <input type="number" min="0" value={habitaciones} onChange={(e) => setHabitaciones(e.target.value)} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>{t('modal.beds')}</label>
                  <input type="number" min="0" value={camas} onChange={(e) => setCamas(e.target.value)} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>{t('modal.baths')}</label>
                  <input type="number" min="0" value={banos} onChange={(e) => setBanos(e.target.value)} className={inputCls} placeholder="0" />
                </div>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t('modal.checkInTime')}</label>
                  <input type="time" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('modal.checkOutTime')}</label>
                  <input type="time" value={horaSalida} onChange={(e) => setHoraSalida(e.target.value)} className={inputCls} />
                </div>
              </div>
            </fieldset>
          )}

          {/* Amenidades - solo hospedaje */}
          {tipo === 'hospedaje' && (
            <fieldset className="mb-6">
              <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.amenitiesLegend')}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {amenidades.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 transition-colors hover:border-verde-hoja cursor-pointer">
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
            <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.imagesLegend')}</legend>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setArchivos((prev) => [...prev, ...Array.from(e.target.files)])}
              className="block w-full text-sm text-cafe file:mr-4 file:rounded-full file:border-0 file:bg-iguana-hondo file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white file:cursor-pointer hover:file:bg-verde-bosque"
            />
            {(imagenesExistentes.length > 0 || archivos.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-3">
                {imagenesExistentes.map((img, i) => (
                  <div key={`existente-${img.id}`} className="relative h-20 w-20 overflow-hidden rounded-[22px] border border-neutral-200">
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute top-0 left-0 rounded-br-[22px] bg-verde-bosque px-1.5 py-0.5 text-[10px] font-bold text-white">{t('modal.primaryBadge')}</span>}
                    <button
                      type="button"
                      onClick={() => quitarImagenExistente(img.id)}
                      aria-label={t('modal.removeImage')}
                      className="absolute top-0.5 right-0.5 rounded-full bg-red-600 p-0.5 text-white hover:bg-red-700"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
                {archivos.map((a, i) => (
                  <div key={`nueva-${i}`} className="relative h-20 w-20 overflow-hidden rounded-[22px] border border-neutral-200">
                    <img src={URL.createObjectURL(a)} alt="" className="h-full w-full object-cover" />
                    {imagenesExistentes.length === 0 && i === 0 && <span className="absolute top-0 left-0 rounded-br-[22px] bg-verde-bosque px-1.5 py-0.5 text-[10px] font-bold text-white">{t('modal.primaryBadge')}</span>}
                    <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 rounded-full bg-red-600 p-0.5 text-white hover:bg-red-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          {/* Disponibilidad - solo experiencia */}
          {tipo === 'experiencia' && (
            <fieldset className="mb-6">
              <legend className="mb-3 text-lg font-bold text-verde-bosque">{t('modal.datesLegend')}</legend>
              <p className="mb-3 text-sm text-cafe">
                {esEdicion ? t('modal.datesHintEdit') : t('modal.datesHint')}
              </p>

              <div className="rounded-[22px] border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => cambiarMesCal(-1)} aria-label={t('common:calendar.prevMonth')} className="cursor-pointer rounded-full p-1.5 text-iguana-hondo transition-colors hover:bg-iguana-hondo/10">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </button>
                  <p className="text-sm font-bold text-verde-bosque">{formatMonthYear(new Date(anioCal, mesCal, 1), locale)}</p>
                  <button type="button" onClick={() => cambiarMesCal(1)} aria-label={t('common:calendar.nextMonth')} className="cursor-pointer rounded-full p-1.5 text-iguana-hondo transition-colors hover:bg-iguana-hondo/10">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, i) => {
                    const label = weekdayShortMonFirst(i, locale)
                    return <span key={label} className="py-1 text-center text-[11px] font-semibold uppercase text-cafe">{label}</span>
                  })}
                  {celdasCalendario().map((celda, i) => (
                    <div key={i}>
                      {celda.dia ? (
                        <button
                          type="button"
                          onClick={() => toggleFecha(celda.fecha)}
                          disabled={celda.pasado}
                          className={`h-9 w-full rounded-full text-sm font-semibold transition-colors ${
                            celda.pasado
                              ? 'cursor-not-allowed text-neutral-300'
                              : celda.seleccionado
                                ? 'bg-verde-bosque text-white'
                                : 'cursor-pointer text-neutral-700 hover:bg-verde-hoja/20'
                          }`}
                        >
                          {celda.dia}
                        </button>
                      ) : (
                        <span className="block h-9" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>{t('modal.startTime')}</label>
                  <input type="time" value={horaInicioExp} onChange={(e) => setHoraInicioExp(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('modal.endTime')}</label>
                  <input type="time" value={horaFinExp} onChange={(e) => setHoraFinExp(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-verde-bosque">
                  {t('modal.selectedDates', { n: fechasSeleccionadas.length })}
                </p>
                {fechasSeleccionadas.length === 0 ? (
                  <p className="rounded-[22px] border border-dashed border-cafe-claro bg-white px-3 py-4 text-center text-sm text-cafe">
                    {t('modal.noDatesYet')}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {[...fechasSeleccionadas].sort().map((f) => {
                      const esOriginal = esEdicion && fechasOriginalesExp.includes(f)
                      return (
                        <span key={f} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${esOriginal ? 'bg-neutral-100 text-neutral-500' : 'bg-verde-bosque/10 text-verde-bosque'}`}>
                          {formatearFechaChip(f)}
                          {esEdicion && tipo === 'experiencia' && esOriginal ? (
                            <span className="text-[10px]" title={t('modal.cannotRemoveDate')}>🔒</span>
                          ) : (
                            <button type="button" onClick={() => toggleFecha(f)} aria-label={t('modal.removeDate')} className="cursor-pointer rounded-full p-0.5 hover:bg-verde-bosque/20">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
                {esEdicion && tipo === 'experiencia' && fechasOriginalesExp.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700">{t('modal.cannotRemoveDateHint')}</p>
                )}
              </div>
            </fieldset>
          )}

          {/* Botones */}
          <div className="flex flex-col-reverse gap-3 border-t border-cafe-claro/30 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={handleCerrar} className="cursor-pointer rounded-full border border-cafe-claro bg-white px-5 py-2.5 text-sm font-semibold text-verde-bosque transition-colors hover:bg-neutral-50">
              {t('common:actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="cursor-pointer rounded-full bg-verde-bosque px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque/90 disabled:opacity-50"
            >
              {enviando ? (esEdicion ? t('modal.saving') : t('modal.creating')) : (esEdicion ? t('modal.save') : t('modal.create'))}
            </button>
          </div>
        </form>
      </div>

      {confirmarSalida && (
        <div
          ref={refConfirmar}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmar-salida-titulo"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-sm rounded-[22px] bg-crema p-6">
            <h3 id="confirmar-salida-titulo" className="mb-2 text-lg font-bold text-verde-bosque">{t('modal.leaveTitle')}</h3>
            <p className="mb-5 text-sm text-cafe">{t('modal.leaveBody')}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmarSalida(false)}
                className="cursor-pointer rounded-full border border-cafe-claro bg-white px-4 py-2 text-sm font-semibold text-verde-bosque transition-colors hover:bg-neutral-50"
              >
                {t('modal.stayButton')}
              </button>
              <button
                type="button"
                onClick={confirmarCierre}
                className="cursor-pointer rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                {t('modal.leaveYes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
