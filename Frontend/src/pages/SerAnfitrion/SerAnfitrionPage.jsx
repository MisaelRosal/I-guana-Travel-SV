import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMunicipios, registrarAnfitrion, obtenerSesion, guardarSesion } from '../../services/anfitriones.js'
import { api, readCsrfToken } from '../../services/api.js'
import Toast from '../../components/Toast.jsx'

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'
const labelCls = 'block text-sm font-semibold text-verde-bosque mb-1'

export default function SerAnfitrionPage() {
  // F2a (i18n-es-en): `publicacion` namespace owns the frontend copy. Session
  // prefills (email/telefono from `usuario`) and DB option labels render
  // verbatim — passthrough is out of scope for resources.
  const { t } = useTranslation('publicacion')
  const navigate = useNavigate()
  const usuario = obtenerSesion()
  const [departamentos, setDepartamentos] = useState([])
  const [municipios, setMunicipios] = useState([])
  const [departamentoId, setDepartamentoId] = useState('')
  const [municipioId, setMunicipioId] = useState('')
  // El nombre publicable del anfitrion NO se edita aqui: se deriva siempre
  // del nombre y apellido de la cuenta (usuarios). La direccion dejo de
  // solicitarse en el formulario; puede completarse por otro medio si se desea.
  const nombreAnfitrion = usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : ''
  const [email, setEmail] = useState(usuario?.email ?? '')
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '')
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
    // Direct fetch (multipart upload) — attach the auth cookie and CSRF header
    // that the api() helper would normally add for mutations.
    const res = await fetch('/api/Imagenes/upload', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': readCsrfToken() },
      body: formData,
    })
    if (!res.ok) throw new Error(t('uploadError'))
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
      setError(t('errors.photoRequired'))
      setToast({ tipo: 'error', mensaje: t('errors.photoRequired') })
      return
    }
    if (!descripcion.trim()) {
      setError(t('errors.descRequired'))
      setToast({ tipo: 'error', mensaje: t('errors.descRequired') })
      return
    }
    if (!municipioId) {
      setError(t('errors.municipioRequired'))
      setToast({ tipo: 'error', mensaje: t('errors.municipioRequired') })
      return
    }
    setSubiendo(true)
    setEnviando(true)
    try {
      const url = fotoUrl || (await subirFoto())
      const anfitrion = await registrarAnfitrion({
        municipioId,
        nombre: nombreAnfitrion,
        email: email.trim(),
        telefono: telefono.trim(),
        descripcion: descripcion.trim(),
        fotoPerfil: url,
      })
      guardarSesion({ ...usuario, rol: 'anfitrion', fotoPerfil: url })
      setToast({ tipo: 'exito', mensaje: t('successToast') })
      setTimeout(() => navigate('/panel'), 1500)
      return anfitrion
    } catch (err) {
      const mensajeError = err.mensaje || err.message || t('genericError')
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
          <h1 className="text-2xl font-bold text-verde-bosque">{t('heading')}</h1>
          <p className="mt-3 text-cafe">
            {t('loginRequired.body')}
          </p>
          <Link
            to="/login"
            className="cursor-pointer mt-6 inline-block rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors"
          >
            {t('loginRequired.cta')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-cafe-claro/60 bg-white p-5 shadow-md sm:p-8">
          <h1 className="text-2xl font-bold text-verde-bosque">{t('heading')}</h1>
          <p className="mt-1 text-sm text-cafe">
            {t('subtitle')}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="anf-foto">{t('photoLabel')}</label>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="cursor-pointer flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-neutral-300 bg-crema text-3xl text-cafe hover:border-verde-hoja"
                  >
                    {foto || fotoUrl ? (
                      <img src={foto ? URL.createObjectURL(foto) : fotoUrl} alt={t('photoAlt')} className="h-full w-full object-cover" />
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
                      {t('choosePhoto')}
                    </button>
                    <p className="mt-1">{t('photoHint')}</p>
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
                <label className={labelCls} htmlFor="anf-email">{t('emailLabel')}</label>
                <input id="anf-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-telefono">{t('phoneLabel')}</label>
                <input id="anf-telefono" className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder={t('phonePlaceholder')} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="anf-descripcion">{t('descLabel')}</label>
                <textarea
                  id="anf-descripcion"
                  className={inputCls + ' h-24 resize-none'}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder={t('descPlaceholder')}
                  required
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-departamento">{t('deptoLabel')}</label>
                <select id="anf-departamento" className={inputCls} value={departamentoId} onChange={(e) => { setDepartamentoId(e.target.value); setMunicipioId('') }} required>
                  <option value="">{t('deptoOption')}</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="anf-municipio">{t('muniLabel')}</label>
                <select id="anf-municipio" className={inputCls} value={municipioId} onChange={(e) => setMunicipioId(e.target.value)} required disabled={!departamentoId}>
                  <option value="">{t('muniOption')}</option>
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
              {subiendo ? t('submittingPhoto') : enviando ? t('submitting') : t('submit')}
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