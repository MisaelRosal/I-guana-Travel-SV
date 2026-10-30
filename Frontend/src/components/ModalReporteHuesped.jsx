import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalAccesible } from '../hooks/useModalAccesible.js'
import { crearReporte, subirEvidenciaReporte } from '../services/reportes.js'

export default function ModalReporteHuesped({ reserva, onCerrar, onExito }) {
  const { t } = useTranslation('panel')
  const refDialogo = useModalAccesible(onCerrar)
  const [tipo, setTipo] = useState('dano')
  const [descripcion, setDescripcion] = useState('')
  const [archivos, setArchivos] = useState([])
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)

  const handleEnviar = async () => {
    if (!descripcion.trim()) {
      setError(t('reports.descriptionRequired') || 'Agrega una descripción del daño o perjuicio.')
      return
    }
    setProcesando(true)
    setError(null)
    try {
      const res = await crearReporte({ reservaId: reserva.id, tipo, descripcion })
      for (const f of archivos) {
        await subirEvidenciaReporte(res.id, f)
      }
      onExito?.()
      onCerrar()
    } catch (err) {
      setError(err.mensaje || err.message || 'No se pudo enviar el reporte.')
      setProcesando(false)
    }
  }

  return (
    <div
      ref={refDialogo}
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-modal-box w-full max-w-md rounded-[22px] bg-white p-6 ring-1 ring-black/5 max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-xl font-bold text-iguana-hondo">Reportar huésped</h2>
          <button type="button" onClick={onCerrar} disabled={procesando} className="text-2xl leading-none text-cafe hover:text-iguana-hondo">&times;</button>
        </div>
        <p className="mb-4 text-sm text-cafe">{reserva.nombreHuesped} · {reserva.experienciaTitulo}</p>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold text-verde-bosque">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-[22px] border border-cafe-claro px-3 py-2 text-sm">
            <option value="dano">Daño a la propiedad</option>
            <option value="perjuicio">Perjuicio / incumplimiento</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold text-verde-bosque">Descripción</label>
          <textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="w-full resize-none rounded-[22px] border border-cafe-claro px-3 py-2 text-sm" placeholder="Describe lo ocurrido..." />
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold text-verde-bosque">Evidencias (fotos)</label>
          <input type="file" accept="image/*" multiple onChange={(e) => setArchivos(Array.from(e.target.files || []))} className="text-sm" />
          {archivos.length > 0 && <p className="mt-1 text-xs text-cafe">{archivos.length} archivo(s) seleccionado(s)</p>}
        </div>
        {error && <p className="mb-4 rounded-[22px] bg-red-50 p-2 text-center text-sm text-red-700">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={handleEnviar} disabled={procesando} className="flex-1 rounded-full bg-iguana-hondo px-4 py-2.5 font-semibold text-white disabled:opacity-50">Enviar reporte</button>
          <button type="button" onClick={onCerrar} disabled={procesando} className="flex-1 rounded-full border border-neutral-300 px-4 py-2.5 font-semibold text-verde-bosque">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
