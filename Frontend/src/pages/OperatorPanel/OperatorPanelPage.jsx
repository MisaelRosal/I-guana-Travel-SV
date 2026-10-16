import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getContentLocale, useFormatLocale } from '../../i18n/config.js'
import { formatDateDMY, formatPrice } from '../../i18n/format.js'
import { api } from '../../services/api.js'
import CrearPublicacionModal from '../../components/CrearPublicacionModal.jsx'
import { getMiPerfil, obtenerSesion, esAdmin } from '../../services/anfitriones.js'
import { getMisResenas, responderResena } from '../../services/resenas.js'
import { scrollBehavior } from '../../utils/motion.js'
import { Estrellas } from '../../components/Estrellas.jsx'
import DashboardGanancias from '../../components/DashboardGanancias.jsx'
import GestorDisponibilidad from '../../components/GestorDisponibilidad.jsx'

export default function OperatorPanelPage() {
  const { t, i18n } = useTranslation('panel')
  const locale = useFormatLocale()
  const contentLocale = getContentLocale(i18n.resolvedLanguage || i18n.language)
  const usuario = obtenerSesion()
  const [publicaciones, setPublicaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [pubEditando, setPubEditando] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [anfitrionPropio, setAnfitrionPropio] = useState(null)
  const [pestana, setPestana] = useState('publicaciones')
  const [resumenesResenas, setResumenesResenas] = useState([])
  const [listaResenas, setListaResenas] = useState([])
  const [respondiendoId, setRespondiendoId] = useState(null)
  const [textoRespuesta, setTextoRespuesta] = useState('')
  const [guardandoId, setGuardandoId] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      if (esAdmin(usuario?.rol)) {
        setPublicaciones(await api.get('/Publicacione'))
      } else if (usuario?.rol === 'anfitrion') {
        // W4: the own row is resolved server-side through GET mi-perfil; the
        // public /Anfitrione list no longer exposes usuarioId. A 404 (no host
        // record) ends in the same propio===null state the old find produced.
        let propio = null
        try {
          propio = await getMiPerfil()
        } catch {
          propio = null
        }
        setAnfitrionPropio(propio)
        setPublicaciones(propio ? await api.get(`/Publicacione/anfitrion/${propio.id}`) : [])
      } else {
        // Plain usuarios never own a host row: skip the call, keep the null.
        setAnfitrionPropio(null)
        setPublicaciones([])
      }
    } catch {
      setPublicaciones([])
    } finally {
      setCargando(false)
    }
  }, [usuario?.rol, usuario?.id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cargarResenas = useCallback(async () => {
    try {
      const data = await getMisResenas(contentLocale)
      setResumenesResenas(data.resumenes || [])
      setListaResenas(data.resenas || [])
    } catch {
      setResumenesResenas([])
      setListaResenas([])
    }
  }, [contentLocale])

  useEffect(() => {
    cargarResenas()
  }, [cargarResenas])

  const iniciarRespuesta = (r) => {
    setRespondiendoId(r.id)
    setTextoRespuesta(r.respuestaAnfitrionFuente ?? r.respuestaAnfitrion ?? '')
  }

  const guardarRespuesta = async (r) => {
    setGuardandoId(r.id)
    try {
      await responderResena(r.id, textoRespuesta)
      await cargarResenas()
      setRespondiendoId(null)
      setTextoRespuesta('')
      setMensaje(t('reviews.updated'))
    } catch (e) {
      setMensaje(e.mensaje || e.message || t('reviews.error'))
    } finally {
      setGuardandoId(null)
    }
  }

  const alCrear = () => {
    setModalAbierto(false)
    setMensaje(t('toast.created'))
    cargar()
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }

  const alEditar = (p) => {
    setConfirmando(null)
    setPubEditando(p)
    setModalAbierto(true)
  }

  const alGuardarEdicion = () => {
    setModalAbierto(false)
    setPubEditando(null)
    setMensaje(t('toast.updated'))
    cargar()
    window.scrollTo({ top: 0, behavior: scrollBehavior() })
  }

  const alEliminar = async (p) => {
    setEliminando(p.id)
    setConfirmando(null)
    try {
      await api.delete(`/Publicacione/${p.id}`)
      setMensaje(t('toast.deleted', { title: p.titulo }))
      cargar()
      window.scrollTo({ top: 0, behavior: scrollBehavior() })
    } catch {
      setEliminando(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-verde-bosque">{t('heading')}</h1>
          <p className="mt-1 text-cafe">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => { setPubEditando(null); setModalAbierto(true) }}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-terracota px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('create')}
        </button>
      </div>

      {mensaje && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-verde-hoja/50 bg-verde-hoja/10 px-4 py-3 text-sm font-semibold text-verde-bosque" role="status">
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

      <div className="mb-6 flex gap-2 border-b border-neutral-200">
        {[
          { id: 'publicaciones', etiqueta: t('tabs.publications') },
          { id: 'disponibilidad', etiqueta: t('availability.tab') },
          { id: 'dashboard', etiqueta: t('dashboard.tab') },
          { id: 'resenas', etiqueta: t('reviews.tab', { count: listaResenas.length }) },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPestana(tab.id)}
            aria-pressed={pestana === tab.id}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              pestana === tab.id
                ? 'border-terracota text-terracota'
                : 'border-transparent text-cafe hover:text-verde-bosque'
            }`}
          >
            {tab.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'publicaciones' && (
      <div className="overflow-hidden rounded-xl border border-cafe-claro/40 bg-white shadow-sm">
        {cargando ? (
          <p className="px-6 py-14 text-center text-cafe">{t('status.loading')}</p>
        ) : publicaciones.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-semibold text-verde-bosque">{t('status.emptyTitle')}</p>
            <p className="mt-1 text-sm text-cafe">
              {t('status.emptyBody')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-verde-bosque text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('table.listing')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.category')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.price')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.capacity')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.images')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.status')}</th>
                  <th className="px-4 py-3 font-semibold">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cafe-claro/30">
                {publicaciones.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-crema">
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-verde-bosque">{p.titulo}</span>
                      <span className="text-xs text-cafe">
                        {(p.municipio ?? p.anfitrion?.municipio)?.nombre ?? ''}
                        {(p.municipio ?? p.anfitrion?.municipio)?.departamento?.nombre
                          ? `, ${(p.municipio ?? p.anfitrion?.municipio).departamento.nombre}`
                          : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.categoria?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-terracota">
                      {formatPrice(p.precioPorNoche, locale)}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{t('capacity', { count: p.capacidadMaxima })}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.imagenesPublicacions?.length ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-verde-hoja/15 px-3 py-1 text-xs font-semibold text-verde-bosque">
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {confirmando === p.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-cafe">{t('common:actions.deleteQuestion')}</span>
                          <button
                            type="button"
                            onClick={() => alEliminar(p)}
                            className="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                          >
                            {t('common:actions.deleteYes')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmando(null)}
                            className="cursor-pointer rounded bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                          >
                            {t('common:actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => alEditar(p)}
                            className="relative cursor-pointer rounded p-1.5 text-cafe transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-cafe/10 hover:text-cafe-oscuro"
                            title={t('action.editTitle')}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmando(p.id)}
                            disabled={eliminando === p.id}
                            className="relative cursor-pointer rounded p-1.5 text-red-500 transition-colors after:absolute after:-inset-y-2 after:-inset-x-0.5 after:content-[''] hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                            title={t('action.deleteTitle')}
                          >
                            {eliminando === p.id ? (
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                <path d="M12 2a10 10 0 0 1 10 10" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6" />
                              </svg>
                            )}
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

      {pestana === 'disponibilidad' && (
        <GestorDisponibilidad
          publicaciones={publicaciones}
          onActualizado={cargar}
          onMensaje={setMensaje}
        />
      )}

      {pestana === 'dashboard' && (
        <DashboardGanancias
          publicaciones={publicaciones}
          esAdmin={esAdmin(usuario?.rol)}
          totalResenas={listaResenas.length}
          onVerPublicaciones={() => setPestana('publicaciones')}
          onVerResenas={() => setPestana('resenas')}
          onCrearPublicacion={() => { setPubEditando(null); setModalAbierto(true) }}
        />
      )}

      {pestana === 'resenas' && (
        <div className="space-y-5">
          {resumenesResenas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {resumenesResenas.map((r) => (
                <span
                  key={r.publicacionId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cafe-claro/50 bg-crema/60 px-3 py-1.5 text-xs"
                >
                  <span className="max-w-[200px] truncate font-semibold text-verde-bosque">{r.titulo}</span>
                  <span className="font-bold text-amber">★ {Number(r.promedio).toFixed(1)}</span>
                  <span className="text-cafe">
                    ({t('reviews.count', { count: r.total })})
                  </span>
                </span>
              ))}
            </div>
          )}

          {listaResenas.length === 0 ? (
            <div className="rounded-xl border border-cafe-claro/40 bg-white px-6 py-14 text-center shadow-sm">
              <p className="text-lg font-semibold text-verde-bosque">{t('reviews.emptyTitle')}</p>
              <p className="mt-1 text-sm text-cafe">{t('reviews.emptyBody')}</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {listaResenas.map((r) => (
                <li key={r.id} className="rounded-xl border border-cafe-claro/40 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-verde-bosque">{r.hueped}</p>
                      <p className="truncate text-xs text-cafe">
                        {formatDateDMY(r.fecha, locale)} · {r.publicacion?.titulo}
                      </p>
                    </div>
                    <Estrellas valor={r.calificacion} className="h-4 w-4 shrink-0" />
                  </div>

                  {r.comentario && (
                    <p className="mt-3 text-sm leading-relaxed text-neutral-800">{r.comentario}</p>
                  )}

                  {r.respuestaAnfitrion && respondiendoId !== r.id && (
                    <div className="mt-3 rounded-lg bg-crema p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-terracota">{t('reviews.yourReply')}</p>
                      <p className="mt-1 text-sm text-neutral-800">{r.respuestaAnfitrion}</p>
                      {r.fechaRespuesta && (
                        <p className="mt-1 text-xs text-cafe">{formatDateDMY(r.fechaRespuesta, locale)}</p>
                      )}
                    </div>
                  )}

                  {respondiendoId === r.id ? (
                    <div className="mt-3">
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={textoRespuesta}
                        onChange={(e) => setTextoRespuesta(e.target.value)}
                        placeholder={t('reviews.replyPlaceholder')}
                        className="w-full resize-none rounded-lg border border-cafe-claro px-3 py-2 text-sm text-neutral-800 focus:border-verde-bosque focus:outline-none"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-cafe">{textoRespuesta.length}/500</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setRespondiendoId(null); setTextoRespuesta('') }}
                            className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-verde-bosque hover:bg-neutral-50"
                          >
                            {t('common:actions.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => guardarRespuesta(r)}
                            disabled={guardandoId === r.id}
                            className="cursor-pointer rounded-lg bg-terracota px-3 py-1.5 text-xs font-semibold text-white hover:bg-verde-bosque disabled:opacity-50"
                          >
                            {guardandoId === r.id ? t('reviews.publishing') : t('reviews.publish')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => iniciarRespuesta(r)}
                      className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-azul transition-colors hover:text-azul-cielo"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v1" />
                      </svg>
                      {r.respuestaAnfitrion ? t('reviews.editReply') : t('reviews.respond')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CrearPublicacionModal
        abierto={modalAbierto}
        onCerrar={() => { setModalAbierto(false); setPubEditando(null) }}
        onCreada={pubEditando ? alGuardarEdicion : alCrear}
        pubExistente={pubEditando}
        esEdicion={!!pubEditando}
        anfitrionFijo={usuario?.rol === 'anfitrion' ? anfitrionPropio : null}
      />
    </div>
  )
}
