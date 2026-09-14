import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMunicipios, registrarAnfitrion, obtenerSesion, guardarSesion } from '../../services/anfitriones.js'
import { api } from '../../services/api.js'
import Toast from '../../components/Toast.jsx'

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'
const labelCls = 'block text-sm font-semibold text-verde-bosque mb-1'

export default function SerAnfitrionPage() {
  const navigate = useNavigate()
  const usuario = obtenerSesion()
  const [departamentos, setDepartamentos] = useState([])
  const [municipios, setMunicipios] = useState([])
  const [departamentoId, setDepartamentoId] = useState('')
  const [municipioId, setMunicipioId] = useState('')
  const [nombre, setNombre] = useState(usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : '')
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '')
  const [direccion, setDireccion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState(null)
  const [fotoUrl, setFotoUrl] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!usuario) return
    api.get('/Departamento').then(setDepartamentos).catch(() => {})
  }, [])

  useEffect(() => {
    if (!departamentoId) { setMunicipios([]); return }
    getMunicipios().then((ms) => {
      setMunicipios(ms.filter((m) => m.departamentoId === parseInt(departamentoId)))
    }).catch(() => {})
  }, [departamentoId])

  const elegirFoto = (e) => {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setFoto(archivo)
    setFotoUrl('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const subirFoto = async () => {
    if (!foto) return ''
    const formData = new FormData()
    formData.append('file', foto)
    const res = await fetch('/api/Imagenes/upload', { method: 'POST', body: formData })
    if (!res.ok) throw new Error('No se pudo subir la foto.')
    const data = await res.json()
    const item = Array.isArray(data) ? data[0] : data
    return item?.url ?? ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!usuario) {
      navigate('/login')
      return
    }
    if (!foto && !fotoUrl) {
      setError('La foto de perfil es obligatoria.')
      setToast({ tipo: 'error', mensaje: 'La foto de perfil es obligatoria.' })
      return
    }
    if (!descripcion.trim()) {
      setError('Contanos una breve descripción sobre vos.')
      setToast({ tipo: 'error', mensaje: 'Contanos una breve descripción sobre vos.' })
      return
    }
    if (!municipioId) {
      setError('Seleccioná tu municipio.')
      setToast({ tipo: 'error', mensaje: 'Seleccioná tu municipio.' })
      return
    }
    setSubiendo(true)
    setEnviando(true)
    try {
      const url = fotoUrl || (await subirFoto())
      const anfitrion = await registrarAnfitrion({
        usuarioId: usuario.id,
        municipioId,
        nombre: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim(),
        direccion: direccion.trim(),
        descripcion: descripcion.trim(),
        fotoPerfil: url,
      })
      guardarSesion({ ...usuario, rol: 'anfitrion', fotoPerfil: url })
      setToast({ tipo: 'exito', mensaje: '¡Ya sos anfitrión!' })
      setTimeout(() => navigate('/panel'), 1500)
      return anfitrion
    } catch (err) {
      const mensajeError = err.mensaje || err.message || 'No se pudo completar el registro.'
      setError(mensajeError)
      setToast({ tipo: 'error', mensaje: mensajeError })
    } finally {
      setSubiendo(false)
      setEnviando(false)
    }
  }

  if (!usuario) {
    return (
      <main className="flex justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-verde-bosque">Conviértete en anfitrión</h1>
          <p className="mt-3 text-cafe">
            Para ofrecer tus experiencias necesitás iniciar sesión.
          </p>
          <Link
            to="/login"
            className="cursor-pointer mt-6 inline-block rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-cafe-claro/60 bg-white p-8 shadow-md">
          <h1 className="text-2xl font-bold text-verde-bosque">Conviértete en anfitrión</h1>
          <p className="mt-1 text-sm text-cafe">
            Creá tu perfil de anfitrión. Necesitamos una foto de tu persona.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="anf-foto">Foto de perfil *</label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="cursor-pointer flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-neutral-300 bg-crema text-3xl text-cafe hover:border-verde-hoja"
                  >
                    {foto || fotoUrl ? (
                      <img src={foto ? URL.createObjectURL(foto) : fotoUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
                    ) : (
                      '+'
                    )}
                  </button>
                  <div className="text-sm text-cafe">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="cursor-pointer font-semibold text-terracota hover:text-verde-bosque"
                    >
                      Elegir foto
                    </button>
                    <p className="mt-1">JPG o PNG. Será visible para tus huéspedes.</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={elegirFoto}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="anf-nombre">Nombre *</label>
                <input id="anf-nombre" className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="anf-email">Correo electrónico *</label>
                <input id="anf-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-telefono">Teléfono</label>
                <input id="anf-telefono" className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono de contacto" />
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-direccion">Dirección</label>
                <input id="anf-direccion" className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección (opcional)" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="anf-descripcion">Breve descripción *</label>
                <textarea
                  id="anf-descripcion"
                  className={inputCls + ' h-24 resize-none'}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Contanos quién sos y qué experiencia ofrecés..."
                  required
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-departamento">Departamento *</label>
                <select id="anf-departamento" className={inputCls} value={departamentoId} onChange={(e) => { setDepartamentoId(e.target.value); setMunicipioId('') }} required>
                  <option value="">Seleccioná un departamento</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-municipio">Municipio *</label>
                <select id="anf-municipio" className={inputCls} value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} required disabled={!departamentoId}>
                  <option value="">Seleccioná un municipio</option>
                  {municipios.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando || subiendo}
              className="cursor-pointer w-full rounded-lg bg-terracota px-4 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
            >
              {subiendo ? 'Subiendo foto...' : enviando ? 'Registrando...' : 'Crear perfil de anfitrión'}
            </button>
          </form>
        </div>
      </div>

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </main>
  )
}