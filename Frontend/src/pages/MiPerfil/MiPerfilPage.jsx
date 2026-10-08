import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { localePath } from '../../i18n/routes.jsx'
import { getMiPerfil, actualizarMiPerfilAnfitrion, getMunicipios, obtenerSesion } from '../../services/anfitriones.js'
import { api } from '../../services/api.js'
import Toast from '../../components/Toast.jsx'

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'
const labelCls = 'block text-sm font-semibold text-verde-bosque mb-1'

function Avatar({ anfitrion }) {
  // F2a (i18n-es-en): the `perfil` namespace owns every frontend string here.
  // `anfitrion.*` fields are DB data and always render verbatim (passthrough).
  const { t } = useTranslation('perfil')
  return (
    <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-crema text-4xl font-bold text-cafe shadow-md">
      {anfitrion.fotoPerfil ? (
        <img src={anfitrion.fotoPerfil} alt={t('avatarAlt')} className="h-full w-full object-cover" />
      ) : (
        (anfitrion.nombre || '').charAt(0).toUpperCase()
      )}
    </div>
  )
}

export default function MiPerfilPage() {
  const { t } = useTranslation('perfil')
  const navigate = useNavigate()
  const usuario = obtenerSesion()
  const [anfitrion, setAnfitrion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [departamentos, setDepartamentos] = useState([])
  const [municipios, setMunicipios] = useState([])
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [departamentoId, setDepartamentoId] = useState('')
  const [municipioId, setMunicipioId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')

  // Fills the form fields from the current profile. Used both on load and
  // when cancelling an edit, so the inputs always mirror the saved state.
  const cargarCampos = (perfil) => {
    setCorreo(perfil.email ?? '')
    setTelefono(perfil.telefono ?? '')
    setMunicipioId(perfil.municipioId != null ? String(perfil.municipioId) : '')
    setDepartamentoId(perfil.municipio?.departamentoId != null ? String(perfil.municipio.departamentoId) : '')
    setDescripcion(perfil.descripcion ?? '')
  }

  useEffect(() => {
    if (usuario?.rol !== 'anfitrion') {
      navigate(localePath('catalog'))
      return
    }
    let activo = true
    // W4: the own row comes from GET /Anfitrione/mi-perfil (resolved from the
    // token sub). The public list no longer exposes usuarioId, so the old
    // list+find lookup is gone; a 404 keeps the "no host profile" state.
    getMiPerfil()
      .then((perfil) => {
        if (!activo) return
        setAnfitrion(perfil)
        cargarCampos(perfil)
      })
      .catch(() => {
        if (activo) setAnfitrion(null)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    api.get('/Departamento').then(setDepartamentos).catch(() => {})
    return () => { activo = false }
  }, [usuario?.rol, usuario?.id, navigate])

  // Same departamento→municipio cascade as SerAnfitrionPage: filter the full
  // municipio list client-side by departamentoId.
  useEffect(() => {
    if (!departamentoId) { setMunicipios([]); return }
    getMunicipios().then((ms) => {
      setMunicipios(ms.filter((m) => m.departamentoId === parseInt(departamentoId)))
    }).catch(() => {})
  }, [departamentoId])

  const guardar = async (e) => {
    e.preventDefault()
    if (!anfitrion) return
    setError('')

    if (!correo.trim()) {
      setError(t('errors.emailRequired'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      setError(t('errors.emailInvalid'))
      return
    }
    if (correo.trim().length > 150) {
      setError(t('errors.emailLength'))
      return
    }
    if (telefono.trim().length > 20) {
      setError(t('errors.phoneLength'))
      return
    }
    if (!municipioId) {
      setError(t('errors.municipioRequired'))
      return
    }

    setGuardando(true)
    try {
      // PUT mi-perfil: owner-only endpoint — the server resolves the host row
      // from the token, so there is no id to pass. On success the response is
      // the fresh profile (with the updated municipio/departamento names).
      const actualizado = await actualizarMiPerfilAnfitrion({
        email: correo.trim(),
        telefono: telefono.trim(),
        municipioId: parseInt(municipioId),
        descripcion: descripcion.trim(),
      })
      setAnfitrion(actualizado)
      setDepartamentoId(
        actualizado.municipio?.departamentoId != null ? String(actualizado.municipio.departamentoId) : departamentoId,
      )
      setMunicipioId(actualizado.municipioId != null ? String(actualizado.municipioId) : municipioId)
      setEditando(false)
      setToast({ tipo: 'exito', mensaje: t('savedToast') })
    } catch (err) {
      // err.mensaje carries the server copy, e.g. the 409 "Ese correo ya está
      // registrado por otro anfitrión." — passthrough, never a resource key.
      setError(err.mensaje || err.message || t('updateError'))
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <main className="flex justify-center px-4 py-20">
        <p className="text-cafe">{t('loading')}</p>
      </main>
    )
  }

  if (!anfitrion) {
    return (
      <main className="flex justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-verde-bosque">{t('title')}</h1>
          <p className="mt-3 text-cafe">{t('missing.body')}</p>
          <Link to={localePath('becomeHost')} className="cursor-pointer mt-6 inline-block rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors">
            {t('missing.cta')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to={localePath('catalog')} className="mb-4 block font-medium text-azul hover:text-azul-cielo">
        {t('back')}
      </Link>

      <div className="rounded-xl border border-cafe-claro/60 bg-white p-5 shadow-md sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar anfitrion={anfitrion} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-verde-bosque">{anfitrion.nombre}</h1>
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${anfitrion.verificado ? 'bg-verde-hoja/15 text-verde-bosque' : 'bg-amber-100 text-amber-700'}`}>
              {anfitrion.verificado ? t('badge.verified') : t('badge.pending')}
            </span>
          </div>
        </div>

        {/* Modo lectura: datos de contacto como texto + boton para editar.
            Orden de grilla (2 columnas en sm): Correo, Telefono, Publicaciones
            (debajo del correo), Ubicacion (debajo del telefono), Direccion y
            Breve descripcion. */}
        {!editando && (
          <div className="mt-6 border-t border-neutral-100 pt-6">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('view.email')}</dt>
                <dd className="mt-0.5 text-neutral-800 break-all">{anfitrion.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('view.phone')}</dt>
                <dd className="mt-0.5 text-neutral-800">{anfitrion.telefono || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('view.publications')}</dt>
                <dd className="mt-0.5 text-neutral-800">{anfitrion.publicacionesCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('view.location')}</dt>
                <dd className="mt-0.5 text-neutral-800">
                  {anfitrion.municipio?.nombre ?? '—'}
                  {anfitrion.municipio?.departamento ? `, ${anfitrion.municipio.departamento.nombre}` : ''}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">{t('view.description')}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-neutral-800">{anfitrion.descripcion || '—'}</dd>
              </div>
            </dl>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => { cargarCampos(anfitrion); setError(''); setEditando(true) }}
                className="cursor-pointer rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors"
              >
                {t('edit')}
              </button>
            </div>
          </div>
        )}

        {/* Modo edicion: el formulario completo con guardar/cancelar */}
        {editando && (
        <form className="mt-6 border-t border-neutral-100 pt-6" onSubmit={guardar} noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="mp-correo" className={labelCls}>
                {t('form.emailLabel')}
              </label>
              <input
                id="mp-correo"
                type="email"
                className={inputCls}
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder={t('form.emailPlaceholder')}
                required
              />
            </div>
            <div>
              <label htmlFor="mp-telefono" className={labelCls}>
                {t('form.phoneLabel')}
              </label>
              <input
                id="mp-telefono"
                className={inputCls}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder={t('form.phonePlaceholder')}
              />
            </div>
            <div>
              <label htmlFor="mp-departamento" className={labelCls}>
                {t('form.deptoLabel')}
              </label>
              <select
                id="mp-departamento"
                className={inputCls}
                value={departamentoId}
                onChange={(e) => { setDepartamentoId(e.target.value); setMunicipioId('') }}
                required
              >
                <option value="">{t('form.deptoOption')}</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mp-municipio" className={labelCls}>
                {t('form.muniLabel')}
              </label>
              <select
                id="mp-municipio"
                className={inputCls}
                value={municipioId}
                onChange={(e) => setMunicipioId(e.target.value)}
                required
                disabled={!departamentoId}
              >
                <option value="">{t('form.muniOption')}</option>
                {municipios.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mp-descripcion" className="block text-sm font-semibold text-verde-bosque mb-1">
                {t('form.descLabel')}
              </label>
              <textarea
                id="mp-descripcion"
                className={inputCls + ' h-28 resize-none'}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={t('form.descPlaceholder')}
                required
              />
            </div>
          </div>
          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { cargarCampos(anfitrion); setError(''); setEditando(false) }}
              className="cursor-pointer rounded-lg border border-neutral-300 bg-white px-5 py-2.5 font-semibold text-cafe hover:bg-neutral-50 transition-colors"
            >
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="cursor-pointer rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
            >
              {guardando ? t('form.saving') : t('form.save')}
            </button>
          </div>
        </form>
        )}
      </div>

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </main>
  )
}
