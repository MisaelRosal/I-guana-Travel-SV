import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api.js'
import CrearPublicacionModal from '../../components/CrearPublicacionModal.jsx'
import { getMiPerfil, obtenerSesion, esAdmin } from '../../services/anfitriones.js'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export default function OperatorPanelPage() {
  const { t } = useTranslation('panel')
  const usuario = obtenerSesion()
  const [publicaciones, setPublicaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [pubEditando, setPubEditando] = useState(null)
  const [mensaje, setMensaje] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)
  const [anfitrionPropio, setAnfitrionPropio] = useState(null)

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

  const alCrear = () => {
    setModalAbierto(false)
    setMensaje(t('toast.created'))
    cargar()
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const alEliminar = async (p) => {
    setEliminando(p.id)
    setConfirmando(null)
    try {
      await api.delete(`/Publicacione/${p.id}`)
      setMensaje(t('toast.deleted', { title: p.titulo }))
      cargar()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setEliminando(null)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
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
                      {formatoPrecio.format(p.precioPorNoche)}
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
                            className="cursor-pointer rounded p-1.5 text-cafe transition-colors hover:bg-cafe/10 hover:text-cafe-oscuro"
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
                            className="cursor-pointer rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
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

      <CrearPublicacionModal
        abierto={modalAbierto}
        onCerrar={() => { setModalAbierto(false); setPubEditando(null) }}
        onCreada={pubEditando ? alGuardarEdicion : alCrear}
        pubExistente={pubEditando}
        esEdicion={!!pubEditando}
        anfitrionFijo={usuario?.rol === 'anfitrion' ? anfitrionPropio : null}
      />
    </main>
  )
}
