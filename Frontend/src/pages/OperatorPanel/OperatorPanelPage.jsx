import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api.js'
import CrearPublicacionModal from '../../components/CrearPublicacionModal.jsx'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export default function OperatorPanelPage() {
  const [publicaciones, setPublicaciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [eliminando, setEliminando] = useState(null)
  const [confirmando, setConfirmando] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setPublicaciones(await api.get('/Publicacione'))
    } catch {
      setPublicaciones([])
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const alCrear = () => {
    setModalAbierto(false)
    setMensaje('Publicación creada exitosamente.')
    cargar()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const alEliminar = async (p) => {
    setEliminando(p.id)
    setConfirmando(null)
    try {
      await api.delete(`/Publicacione/${p.id}`)
      setMensaje(`«${p.titulo}» eliminada exitosamente.`)
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
          <h1 className="text-3xl font-bold text-verde-bosque">Panel del operador</h1>
          <p className="mt-1 text-cafe">Gestión de publicaciones del anfitrión.</p>
        </div>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-terracota px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Crear publicación
        </button>
      </div>

      {mensaje && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-verde-hoja/50 bg-verde-hoja/10 px-4 py-3 text-sm font-semibold text-verde-bosque" role="status">
          {mensaje}
          <button
            type="button"
            onClick={() => setMensaje(null)}
            aria-label="Descartar mensaje"
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
          <p className="px-6 py-14 text-center text-cafe">Cargando publicaciones…</p>
        ) : publicaciones.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-semibold text-verde-bosque">Aún no hay publicaciones</p>
            <p className="mt-1 text-sm text-cafe">
              Usa el botón «Crear publicación» para agregar la primera.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-verde-bosque text-white">
                <tr>
                  <th className="px-4 py-3 font-semibold">Publicación</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Precio</th>
                  <th className="px-4 py-3 font-semibold">Capacidad</th>
                  <th className="px-4 py-3 font-semibold">Imágenes</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cafe-claro/30">
                {publicaciones.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-crema">
                    <td className="px-4 py-3">
                      <span className="block font-semibold text-verde-bosque">{p.titulo}</span>
                      <span className="text-xs text-cafe">
                        {p.anfitrion?.municipio?.nombre ?? ''}
                        {p.anfitrion?.municipio?.departamento?.nombre
                          ? `, ${p.anfitrion.municipio.departamento.nombre}`
                          : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.categoria?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-terracota">
                      {formatoPrecio.format(p.precioPorNoche)}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{p.capacidadMaxima} personas</td>
                    <td className="px-4 py-3 text-neutral-700">{p.imagenesPublicacions?.length ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-verde-hoja/15 px-3 py-1 text-xs font-semibold text-verde-bosque">
                        {p.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {confirmando === p.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-cafe">¿Eliminar?</span>
                          <button
                            type="button"
                            onClick={() => alEliminar(p)}
                            className="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                          >
                            Sí, eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmando(null)}
                            className="cursor-pointer rounded bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmando(p.id)}
                          disabled={eliminando === p.id}
                          className="cursor-pointer rounded p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                          title="Eliminar publicación"
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
        onCerrar={() => setModalAbierto(false)}
        onCreada={alCrear}
      />
    </main>
  )
}
