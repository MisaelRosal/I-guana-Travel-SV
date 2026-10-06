import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api.js'
import { esAdmin } from '../../services/anfitriones.js'
import CrearPublicacionModal from '../../components/CrearPublicacionModal.jsx'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

// Tab ids stay internal UI state; labels resolve through the admin namespace.
const pestanas = [
  { id: 'anfitriones', labelKey: 'tabs.hosts' },
  { id: 'publicaciones', labelKey: 'tabs.listings' },
  { id: 'resenas', labelKey: 'tabs.reviews' },
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
  const usuario = obtenerSesion()
  const [pestana, setPestana] = useState('anfitriones')
  const [anfitriones, setAnfitriones] = useState([])
  const [publicaciones, setPublicaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mensaje, setMensaje] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [confirmandoPub, setConfirmandoPub] = useState(null)
  const [pubEditando, setPubEditando] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
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
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (esAdmin(usuario?.rol)) cargar()
  }, [usuario?.rol, cargar])

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

  if (!usuario || !esAdmin(usuario.rol)) {
    return (
      <main className="flex justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-verde-bosque">{t('restricted.title')}</h1>
          <p className="mt-3 text-cafe">
            {t('restricted.body')}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-verde-bosque">{t('heading')}</h1>
        <p className="mt-1 text-cafe">{t('subtitle')}</p>
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

      <div className="mb-6 flex gap-2 border-b border-cafe-claro/30">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={`cursor-pointer -mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              pestana === p.id
                ? 'border-terracota text-terracota'
                : 'border-transparent text-cafe hover:text-verde-bosque'
            }`}
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>

      {pestana === 'anfitriones' && (
        <div className="overflow-hidden rounded-xl border border-cafe-claro/40 bg-white shadow-sm">
          {cargando ? (
            <p className="px-6 py-14 text-center text-cafe">{t('hosts.loading')}</p>
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
                              onClick={() => toggleVerificado(a)}
                              className="cursor-pointer rounded bg-verde-hoja/15 px-2.5 py-1 text-xs font-semibold text-verde-bosque transition-colors hover:bg-verde-hoja/30"
                              title={a.verificado ? t('action.removeVerificationTitle') : t('action.verifyProfileTitle')}
                            >
                              {a.verificado ? t('action.unverify') : t('action.verify')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmando(a.id)}
                              disabled={!!confirmando}
                              className="cursor-pointer rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                              title={t('action.deleteProfileTitle')}
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
        <div className="overflow-hidden rounded-xl border border-cafe-claro/40 bg-white shadow-sm">
          {cargando ? (
            <p className="px-6 py-14 text-center text-cafe">{t('listings.loading')}</p>
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
                      <td className="px-4 py-3 font-semibold text-terracota">
                        {formatoPrecio.format(p.precioPorNoche)}
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
                              className="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                            >
                              {t('common:actions.deleteYes')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoPub(null)}
                              className="cursor-pointer rounded bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                            >
                              {t('common:actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => { setPubEditando(p); setModalAbierto(true) }}
                              className="cursor-pointer rounded p-1.5 text-cafe transition-colors hover:bg-cafe/10 hover:text-cafe-oscuro"
                              title={t('action.editListingTitle')}
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
                              className="cursor-pointer rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                              title={t('action.deleteListingTitle')}
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
        <div className="overflow-hidden rounded-xl border border-cafe-claro/40 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-lg font-semibold text-verde-bosque">{t('reviews.title')}</p>
          <p className="mt-1 text-sm text-cafe">
            {t('reviews.soon')}
          </p>
        </div>
      )}

      <CrearPublicacionModal
        abierto={modalAbierto}
        onCerrar={() => { setModalAbierto(false); setPubEditando(null) }}
        onCreada={() => { setModalAbierto(false); setPubEditando(null); cargar() }}
        pubExistente={pubEditando}
        esEdicion={!!pubEditando}
      />
    </main>
  )
}