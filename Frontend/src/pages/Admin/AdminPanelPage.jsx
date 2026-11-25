import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../../i18n/config.js'
import { formatDateDMY, formatPrice } from '../../i18n/format.js'
import { api } from '../../services/api.js'
import { esAdmin } from '../../services/anfitriones.js'
import { eliminarResena, getMisResenas } from '../../services/resenas.js'
import { Estrellas } from '../../components/Estrellas.jsx'
import CrearPublicacionModal from '../../components/CrearPublicacionModal.jsx'
import { cambiarEstadoReporte, getTodosReportes } from '../../services/reportes.js'
import { cambiarBaneoUsuario, eliminarUsuario, getUsuariosAdmin } from '../../services/adminUsuarios.js'

// Tab ids stay internal UI state; labels resolve through the admin namespace.
const pestanas = [
  { id: 'anfitriones', labelKey: 'tabs.hosts' },
  { id: 'publicaciones', labelKey: 'tabs.listings' },
  { id: 'resenas', labelKey: 'tabs.reviews' },
  { id: 'usuarios', labelKey: 'tabs.users' },
  { id: 'reportes', labelKey: 'tabs.reports' },
]

function obtenerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
  } catch {
    return null
  }
}

export default function AdminPanelPage() {
  const { t } = useTranslation('admin')
  const locale = useFormatLocale()
  const usuario = obtenerSesion()
  const [pestana, setPestana] = useState('anfitriones')
  const [anfitriones, setAnfitriones] = useState([])
  const [publicaciones, setPublicaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  // M5: a load failure must surface for the hosts/listings tables instead of
  // an silent empty table (same shape as the reviews errorResenas flag).
  const [errorCarga, setErrorCarga] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [confirmandoPub, setConfirmandoPub] = useState(null)
  const [pubEditando, setPubEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [reportes, setReportes] = useState([])
  const [cargandoReportes, setCargandoReportes] = useState(false)
  const [errorReportes, setErrorReportes] = useState(false)
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null)
  const [estadoReporte, setEstadoReporte] = useState('en_revision')
  const [notasReporte, setNotasReporte] = useState('')
  const [guardandoReporte, setGuardandoReporte] = useState(false)
  const [errorReporte, setErrorReporte] = useState('')
  const [resenas, setResenas] = useState(null)
  const [cargandoResenas, setCargandoResenas] = useState(false)
  const [errorResenas, setErrorResenas] = useState(false)
  const [confirmandoResena, setConfirmandoResena] = useState(null)
  const [usuarios, setUsuarios] = useState([])
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false)
  const [errorUsuarios, setErrorUsuarios] = useState(false)
  const [busquedaUsuarios, setBusquedaUsuarios] = useState('')
  const [confirmandoUsuario, setConfirmandoUsuario] = useState(null)
  const [procesandoUsuario, setProcesandoUsuario] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorCarga(false)
    try {
      const [anfs, pubs] = await Promise.all([
        api.get('/Anfitrione'),
        api.get('/Publicacione'),
      ])
      setAnfitriones(anfs)
      setPublicaciones(pubs)
    } catch {
      setAnfitriones([])
      setPublicaciones([])
      setErrorCarga(true)
    } finally {
      setCargando(false)
    }
  }, [])

  const cargarReportes = useCallback(async () => {
    setCargandoReportes(true)
    setErrorReportes(false)
    try {
      const r = await getTodosReportes()
      setReportes(Array.isArray(r) ? r : [])
    } catch {
      setReportes([])
      setErrorReportes(true)
    } finally {
      setCargandoReportes(false)
    }
  }, [])

  const cargarUsuarios = useCallback(async () => {
    setCargandoUsuarios(true)
    setErrorUsuarios(false)
    try {
      const r = await getUsuariosAdmin()
      setUsuarios(Array.isArray(r) ? r : [])
    } catch {
      setUsuarios([])
      setErrorUsuarios(true)
    } finally {
      setCargandoUsuarios(false)
    }
  }, [])

  useEffect(() => {
    if (esAdmin(usuario?.rol)) {
      cargar()
      cargarReportes()
    }
  }, [usuario?.rol, cargar, cargarReportes])

  useEffect(() => {
    if (pestana === 'usuarios') cargarUsuarios()
  }, [pestana, cargarUsuarios])

  const alEliminarAnfitrion = async (a) => {
    setConfirmando(a.id)
    try {
      await api.delete(`/Anfitrione/${a.id}`)
      setMensaje(t('toast.hostDeleted', { name: a.nombre }))
      setConfirmando(null)
      cargar()
    } catch {
      setConfirmando(null)
      setMensaje(t('toast.hostDeleteError'))
    }
  }

  const toggleVerificado = async (a) => {
    try {
      await api.put(`/Anfitrione/${a.id}/verificacion`, !a.verificado)
      cargar()
    } catch {
      setMensaje(t('toast.hostStateError'))
    }
  }

  const alEliminarPublicacion = async (p) => {
    setConfirmandoPub(p.id)
    try {
      await api.delete(`/Publicacione/${p.id}`)
      setMensaje(t('toast.listingDeleted', { title: p.titulo }))
      setConfirmandoPub(null)
      cargar()
    } catch {
      setConfirmandoPub(null)
      setMensaje(t('toast.listingDeleteError'))
    }
  }

  const cargarResenas = useCallback(async () => {
    setCargandoResenas(true)
    setErrorResenas(false)
    try {
      setResenas(await getMisResenas())
    } catch {
      setResenas(null)
      setErrorResenas(true)
    } finally {
      setCargandoResenas(false)
    }
  }, [])

  // Reviews load lazily when their tab is first shown, not on the initial load.
  useEffect(() => {
    if (pestana === 'resenas') cargarResenas()
  }, [pestana, cargarResenas])

  const alEliminarResena = async (r) => {
    setConfirmandoResena(r.id)
    try {
      await eliminarResena(r.id)
      setMensaje(t('reviews.deleted'))
      setConfirmandoResena(null)
      cargarResenas()
    } catch {
      setConfirmandoResena(null)
      setMensaje(t('reviews.deleteError'))
    }
  }

  const alternarBaneoUsuario = async (u) => {
    setProcesandoUsuario(u.id)
    try {
      await cambiarBaneoUsuario(u.id, !u.baneado)
      setMensaje(t(u.baneado ? 'toast.userUnbanned' : 'toast.userBanned', {
        name: `${u.nombre} ${u.apellido}`.trim(),
      }))
      await cargarUsuarios()
    } catch {
      setMensaje(t('toast.userStateError'))
    } finally {
      setProcesandoUsuario(null)
    }
  }

  const alEliminarUsuario = async (u) => {
    setProcesandoUsuario(u.id)
    try {
      await eliminarUsuario(u.id)
      setMensaje(t('toast.userDeleted', { name: `${u.nombre} ${u.apellido}`.trim() }))
      setConfirmandoUsuario(null)
      await cargarUsuarios()
    } catch {
      setMensaje(t('toast.userDeleteError'))
    } finally {
      setProcesandoUsuario(null)
    }
  }

  const abrirReporte = (rep) => {
    setReporteSeleccionado(rep)
    setEstadoReporte(rep.estado)
    setNotasReporte(rep.notasAdmin || '')
    setErrorReporte('')
  }

  const guardarReporte = async () => {
    setGuardandoReporte(true)
    setErrorReporte('')
    try {
      await cambiarEstadoReporte(reporteSeleccionado.id, {
        estado: estadoReporte,
        notasAdmin: notasReporte,
      })
      setMensaje(t('reports.updated'))
      setReporteSeleccionado(null)
      await cargarReportes()
    } catch {
      setErrorReporte(t('reports.saveError'))
    } finally {
      setGuardandoReporte(false)
    }
  }

  const usuariosFiltrados = useMemo(() => {
    const q = busquedaUsuarios.trim().toLowerCase()
    if (!q) return usuarios
    return usuarios.filter((u) =>
      `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(q),
    )
  }, [usuarios, busquedaUsuarios])

  if (!usuario || !esAdmin(usuario.rol)) {
    return (
      <div className="flex justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-verde-bosque">{t('restricted.title')}</h1>
          <p className="mt-3 text-cafe">
            {t('restricted.body')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-verde-bosque">{t('heading')}</h1>
        <p className="mt-1 text-cafe">{t('subtitle')}</p>
      </div>

      {mensaje && (
        <div className="mb-6 flex items-center justify-between rounded-[22px] border border-verde-hoja/50 bg-verde-hoja/10 px-4 py-3 text-sm font-semibold text-verde-bosque" role="status">
          {mensaje}
          <button
            type="button"
            onClick={() => setMensaje(null)}
            aria-label={t('common:banner.dismiss')}
            className="cursor-pointer text-verde-bosque/60 transition-colors hover:text-verde-bosque"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2 border-b border-cafe-claro/30">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={`cursor-pointer -mb-px rounded-t-[22px] border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              pestana === p.id
                ? 'border-iguana-hondo text-iguana-hondo'
                : 'border-transparent text-cafe hover:text-verde-bosque'
            }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {pestana === 'anfitriones' && (
        <div className="overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
          {cargando ? (
            <p className="px-6 py-14 text-center text-cafe">{t('hosts.loading')}</p>
          ) : errorCarga ? (
            <div role="alert" className="px-6 py-14 text-center">
              <p className="text-lg font-semibold text-red-700">{t('error.load')}</p>
              <button
                type="button"
                onClick={cargar}
                className="mt-5 cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
              >
                {t('error.retry')}
              </button>
            </div>
          ) : anfitriones.length === 0 ? (
            <p className="px-6 py-14 text-center text-cafe">{t('hosts.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-verde-bosque text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('hosts.table.host')}</th>
                    <th className="px-4 py-3 font-semibold">{t('hosts.table.contact')}</th>
                    <th className="px-4 py-3 font-semibold">{t('hosts.table.location')}</th>
                    <th className="px-4 py-3 font-semibold">{t('hosts.table.listings')}</th>
                    <th className="px-4 py-3 font-semibold">{t('hosts.table.verified')}</th>
                    <th className="px-4 py-3 font-semibold">{t('hosts.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cafe-claro/30">
                  {anfitriones.map((a) => (
                    <tr key={a.id} className="transition-colors hover:bg-crema">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {a.fotoPerfil ? (
                            <img
                              src={a.fotoPerfil}
                              alt={a.nombre}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-verde-hoja/20 text-sm font-bold text-verde-bosque">
                              {a.nombre?.charAt(0) ?? '?'}
                            </div>
                          )}
                          <span className="font-semibold text-verde-bosque">{a.nombre}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        <span className="block">{a.email}</span>
                        <span className="text-xs text-cafe">{a.telefono ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {a.municipio?.nombre ?? '—'}
                        {a.municipio?.departamento?.nombre ? `, ${a.municipio.departamento.nombre}` : ''}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{a.publicaciones?.length ?? 0}</td>
                      <td className="px-4 py-3">
                        {a.verificado ? (
                          <span className="rounded-full bg-verde-hoja/15 px-3 py-1 text-xs font-semibold text-verde-bosque">
                            {t('chip.verified')}
                          </span>
                        ) : (
                          <span className="rounded-full bg-cafe/10 px-3 py-1 text-xs font-semibold text-cafe">
                            {t('chip.pending')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {confirmando === a.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-cafe">{t('common:actions.deleteQuestion')}</span>
                            <button
                              type="button"
                              onClick={() => alEliminarAnfitrion(a)}
                              className="cursor-pointer rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                            >
                              {t('common:actions.deleteYes')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmando(null)}
                              className="cursor-pointer rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                            >
                              {t('common:actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleVerificado(a)}
                              className="cursor-pointer rounded-full bg-verde-hoja/15 px-2.5 py-1 text-xs font-semibold text-verde-bosque transition-colors hover:bg-verde-hoja/30"
                              title={a.verificado ? t('action.removeVerificationTitle') : t('action.verifyProfileTitle')}
                            >
                              {a.verificado ? t('action.unverify') : t('action.verify')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmando(a.id)}
                              disabled={!!confirmando}
                              className="relative cursor-pointer rounded-full p-1.5 text-red-500 transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-red-50 hover:text-red-700"
                              title={t('action.deleteProfileTitle')}
                              aria-label={t('action.deleteProfileTitle')}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pestana === 'publicaciones' && (
        <div className="overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
          {cargando ? (
            <p className="px-6 py-14 text-center text-cafe">{t('listings.loading')}</p>
          ) : errorCarga ? (
            <div role="alert" className="px-6 py-14 text-center">
              <p className="text-lg font-semibold text-red-700">{t('error.load')}</p>
              <button
                type="button"
                onClick={cargar}
                className="mt-5 cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
              >
                {t('error.retry')}
              </button>
            </div>
          ) : publicaciones.length === 0 ? (
            <p className="px-6 py-14 text-center text-cafe">{t('listings.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-verde-bosque text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('listings.table.listing')}</th>
                    <th className="px-4 py-3 font-semibold">{t('listings.table.host')}</th>
                    <th className="px-4 py-3 font-semibold">{t('listings.table.price')}</th>
                    <th className="px-4 py-3 font-semibold">{t('listings.table.status')}</th>
                    <th className="px-4 py-3 font-semibold">{t('listings.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cafe-claro/30">
                  {publicaciones.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-crema">
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-verde-bosque">{p.titulo}</span>
                        <span className="text-xs text-cafe">{p.categoria?.nombre ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{p.anfitrion?.nombre ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-iguana-hondo">
                        {formatPrice(p.precioPorNoche, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-verde-hoja/15 px-3 py-1 text-xs font-semibold text-verde-bosque">
                          {p.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {confirmandoPub === p.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-cafe">{t('common:actions.deleteQuestion')}</span>
                            <button
                              type="button"
                              onClick={() => alEliminarPublicacion(p)}
                              className="cursor-pointer rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                            >
                              {t('common:actions.deleteYes')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoPub(null)}
                              className="cursor-pointer rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                            >
                              {t('common:actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => { setPubEditando(p); setModalAbierto(true) }}
                              className="relative cursor-pointer rounded-full p-1.5 text-cafe transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-cafe/10 hover:text-verde-bosque"
                              title={t('action.editListingTitle')}
                              aria-label={t('action.editListingTitle')}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoPub(p.id)}
                              disabled={!!confirmandoPub}
                              className="relative cursor-pointer rounded-full p-1.5 text-red-500 transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-red-50 hover:text-red-700"
                              title={t('action.deleteListingTitle')}
                              aria-label={t('action.deleteListingTitle')}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pestana === 'resenas' && (
        <div className="overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
          {errorResenas ? (
            <p className="px-6 py-14 text-center text-cafe">{t('reviews.error')}</p>
          ) : cargandoResenas ? (
            <p className="px-6 py-14 text-center text-cafe">{t('reviews.loading')}</p>
          ) : (resenas?.resenas?.length ?? 0) === 0 ? (
            <p className="px-6 py-14 text-center text-cafe">{t('reviews.empty')}</p>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2 border-b border-cafe-claro/30 bg-crema/40 px-4 py-3">
                <span className="w-full text-xs font-semibold uppercase tracking-wide text-cafe">
                  {t('reviews.summaryTitle')}
                </span>
                {(resenas?.resumenes ?? []).map((s) => (
                  <span
                    key={s.publicacionId}
                    className="inline-flex items-center gap-2 rounded-full bg-verde-hoja/15 px-3 py-1 text-xs font-semibold text-verde-bosque"
                  >
                    {s.titulo}
                    <span className="text-iguana-hondo">{Number(s.promedio).toFixed(1)}/5</span>
                    <span className="font-normal text-cafe">({s.total})</span>
                  </span>
                ))}
              </div>
              <ul className="divide-y divide-cafe-claro/30">
                {(resenas?.resenas ?? []).map((r) => (
                  <li key={r.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crema text-sm font-bold text-cafe">
                          {(r.hueped || '').charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-verde-bosque">{r.hueped}</p>
                          <p className="text-xs text-cafe">
                            {r.publicacion?.titulo} · {formatDateDMY(r.fecha, locale)}
                          </p>
                        </div>
                      </div>
                      <Estrellas valor={r.calificacion} className="h-4 w-4" />
                    </div>

                    {r.comentario && (
                      <p className="mt-3 text-sm leading-relaxed text-neutral-800">{r.comentario}</p>
                    )}

                    {r.respuestaAnfitrion && (
                      <div className="mt-3 rounded-[22px] bg-crema p-3">
                        <p className="text-xs font-bold text-iguana-hondo">{t('reviews.hostReply')}</p>
                        <p className="mt-1 text-sm text-neutral-800">{r.respuestaAnfitrion}</p>
                      </div>
                    )}

                    {confirmandoResena === r.id ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-cafe">{t('reviews.deleteConfirm')}</span>
                        <button
                          type="button"
                          onClick={() => alEliminarResena(r)}
                          className="cursor-pointer rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                        >
                          {t('common:actions.deleteYes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoResena(null)}
                          className="cursor-pointer rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                        >
                          {t('common:actions.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmandoResena(r.id)}
                        disabled={!!confirmandoResena}
                        className="relative mt-3 cursor-pointer rounded-full p-1.5 text-red-500 transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-red-50 hover:text-red-700"
                        title={t('reviews.delete')}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {pestana === 'usuarios' && (
        <div className="overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
          <div className="border-b border-cafe-claro/30 p-4">
            <label htmlFor="admin-user-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-cafe">
              {t('users.searchLabel')}
            </label>
            <input
              id="admin-user-search"
              type="search"
              value={busquedaUsuarios}
              onChange={(e) => setBusquedaUsuarios(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
              className="w-full max-w-sm rounded-full border border-cafe-claro/60 px-4 py-2 text-sm focus:border-verde-bosque focus:outline-none"
            />
          </div>

          {cargandoUsuarios ? (
            <p className="px-6 py-14 text-center text-cafe">{t('users.loading')}</p>
          ) : errorUsuarios ? (
            <div role="alert" className="px-6 py-14 text-center">
              <p className="text-lg font-semibold text-red-700">{t('users.error')}</p>
              <button
                type="button"
                onClick={cargarUsuarios}
                className="mt-5 cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
              >
                {t('users.retry')}
              </button>
            </div>
          ) : usuariosFiltrados.length === 0 ? (
            <p className="px-6 py-14 text-center text-cafe">{t('users.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-verde-bosque text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t('users.table.user')}</th>
                    <th className="px-4 py-3 font-semibold">{t('users.table.contact')}</th>
                    <th className="px-4 py-3 font-semibold">{t('users.table.status')}</th>
                    <th className="px-4 py-3 font-semibold">{t('users.table.joined')}</th>
                    <th className="px-4 py-3 font-semibold">{t('users.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cafe-claro/30">
                  {usuariosFiltrados.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-crema">
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-verde-bosque">{u.nombre} {u.apellido}</span>
                        <span className="text-xs text-cafe">#{u.id}</span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        <span className="block">{u.email}</span>
                        <span className="text-xs text-cafe">
                          {u.telefono ?? '—'} · {u.emailVerificado ? t('users.verified') : t('users.unverified')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          u.baneado ? 'bg-red-100 text-red-700' : 'bg-verde-hoja/15 text-verde-bosque'
                        }`}>
                          {u.baneado ? t('users.status.banned') : t('users.status.active')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {u.createdAt ? formatDateDMY(u.createdAt, locale) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {confirmandoUsuario === u.id ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-cafe">{t('users.deleteConfirm')}</span>
                            <button
                              type="button"
                              onClick={() => alEliminarUsuario(u)}
                              disabled={procesandoUsuario === u.id}
                              className="cursor-pointer rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                              {t('common:actions.deleteYes')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoUsuario(null)}
                              className="cursor-pointer rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                            >
                              {t('common:actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => alternarBaneoUsuario(u)}
                              disabled={procesandoUsuario === u.id}
                              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                                u.baneado
                                  ? 'bg-verde-hoja/20 text-verde-bosque hover:bg-verde-hoja/30'
                                  : 'bg-amber/20 text-verde-bosque hover:bg-amber/30'
                              }`}
                            >
                              {u.baneado ? t('users.unban') : t('users.ban')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoUsuario(u.id)}
                              disabled={procesandoUsuario === u.id}
                              className="relative cursor-pointer rounded-full p-1.5 text-red-500 transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                              title={t('users.delete')}
                              aria-label={t('users.delete')}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {pestana === 'reportes' && (
        <div className="overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white">
          {cargandoReportes ? (
            <p className="px-6 py-14 text-center text-cafe">{t('reports.loading')}</p>
          ) : errorReportes ? (
            <div role="alert" className="px-6 py-14 text-center">
              <p className="text-lg font-semibold text-red-700">{t('reports.error')}</p>
              <button
                type="button"
                onClick={cargarReportes}
                className="mt-5 cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
              >
                {t('reports.retry')}
              </button>
            </div>
          ) : reportes.length === 0 ? (
            <p className="px-6 py-14 text-center text-cafe">{t('reports.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-verde-bosque text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Huésped</th>
                    <th className="px-4 py-3 font-semibold">Anfitrión</th>
                    <th className="px-4 py-3 font-semibold">Publicación</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cafe-claro/30">
                  {reportes.map((rep) => (
                    <tr key={rep.id} className="hover:bg-crema">
                      <td className="px-4 py-3 text-xs text-cafe">{rep.creadoEn ? formatDateDMY(rep.creadoEn, locale) : '—'}</td>
                      <td className="px-4 py-3"><div className="font-semibold text-verde-bosque">{rep.huespedNombre}</div><div className="text-xs text-cafe">{rep.huespedEmail}</div></td>
                      <td className="px-4 py-3 text-neutral-700">{rep.anfitrionNombre}</td>
                      <td className="px-4 py-3 text-neutral-700">{rep.publicacionTitulo}</td>
                      <td className="px-4 py-3 text-neutral-700">{rep.tipo}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold">{rep.estado}</span></td>
                      <td className="px-4 py-3"><button type="button" onClick={() => abrirReporte(rep)} className="cursor-pointer rounded-full bg-verde-bosque px-3 py-1 text-xs font-semibold text-white">{t('reports.manage')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {reporteSeleccionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[22px] bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <h2 className="text-xl font-bold text-iguana-hondo">Reporte #{reporteSeleccionado.id}</h2>
              <button type="button" onClick={() => setReporteSeleccionado(null)} className="text-2xl leading-none text-cafe">&times;</button>
            </div>
            <div className="mb-3 space-y-1 text-sm text-neutral-700">
              <p><strong>Huésped:</strong> {reporteSeleccionado.huespedNombre} ({reporteSeleccionado.huespedEmail})</p>
              <p><strong>Anfitrión:</strong> {reporteSeleccionado.anfitrionNombre}</p>
              <p><strong>Publicación:</strong> {reporteSeleccionado.publicacionTitulo}</p>
              <p><strong>Fechas reserva:</strong> {reporteSeleccionado.fechaInicio} - {reporteSeleccionado.fechaFin}</p>
              <p><strong>Tipo:</strong> {reporteSeleccionado.tipo}</p>
              <p><strong>Descripción:</strong> {reporteSeleccionado.descripcion}</p>
            </div>
            {reporteSeleccionado.evidencias?.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-semibold text-verde-bosque">Evidencias</p>
                <div className="grid grid-cols-2 gap-2">
                  {reporteSeleccionado.evidencias.map((ev) => (
                    <a key={ev.id} href={ev.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
                      <img src={ev.url} alt="evidencia" className="h-28 w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-3">
              <label className="mb-1 block text-sm font-semibold text-verde-bosque">Estado</label>
              <select value={estadoReporte} onChange={(e) => setEstadoReporte(e.target.value)} className="w-full rounded-[22px] border border-cafe-claro px-3 py-2 text-sm">
                <option value="pendiente">pendiente</option>
                <option value="en_revision">en_revision</option>
                <option value="resuelto">resuelto</option>
                <option value="rechazado">rechazado</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-sm font-semibold text-verde-bosque">Notas del admin</label>
              <textarea rows={3} value={notasReporte} onChange={(e) => setNotasReporte(e.target.value)} className="w-full resize-none rounded-[22px] border border-cafe-claro px-3 py-2 text-sm" />
            </div>
            {errorReporte && (
              <p className="mb-3 text-sm font-semibold text-red-700" role="alert">{errorReporte}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={guardarReporte}
                disabled={guardandoReporte}
                className="flex-1 cursor-pointer rounded-full bg-iguana-hondo px-4 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque disabled:opacity-50"
              >
                {guardandoReporte ? t('reports.saving') : t('reports.save')}
              </button>
              <button
                type="button"
                onClick={() => { setReporteSeleccionado(null); setErrorReporte('') }}
                className="flex-1 cursor-pointer rounded-full border border-neutral-300 px-4 py-2.5 font-semibold text-verde-bosque"
              >
                {t('reports.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CrearPublicacionModal
        abierto={modalAbierto}
        onCerrar={() => { setModalAbierto(false); setPubEditando(null) }}
        onCreada={() => { setModalAbierto(false); setPubEditando(null); cargar() }}
        pubExistente={pubEditando}
        esEdicion={!!pubEditando}
      />
    </div>
  )
}
