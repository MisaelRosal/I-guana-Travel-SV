import { useState } from 'react'
import { Link } from 'react-router-dom'
import { crearReserva } from '../services/reservas.js'
import Toast from './Toast.jsx'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatearFechaCorta(fecha) {
  if (!fecha) return ''
  const d = new Date(fecha)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = d.getFullYear()
  return `${dia}/${mes}/${anio}`
}

export default function FormularioReserva({ experiencia, fechaInicio, fechaFin, numPersonas, onCancelar, onReservada }) {
  const sesion = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState(null)

  const esHospedaje = experiencia.tipo === 'hospedaje'
  const noches = esHospedaje && fechaInicio && fechaFin
    ? Math.max(1, Math.round((new Date(fechaFin) - new Date(fechaInicio)) / 86400000))
    : 1
  const precioTotal = (experiencia.precio || 0) * (esHospedaje ? noches : numPersonas)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!sesion) return
    setEnviando(true)
    try {
      await crearReserva({
        publicacionId: experiencia.id,
        nombreHuesped: `${sesion.nombre} ${sesion.apellido}`.trim(),
        emailHuesped: sesion.email,
        telefonoHuesped: sesion.telefono || null,
        fechaInicio,
        fechaFin: fechaFin || fechaInicio,
        numeroHuespedes: numPersonas,
        precioTotal,
      })
      setToast({ tipo: 'exito', mensaje: '¡Reserva creada con éxito!' })
      setTimeout(() => onReservada(), 1500)
    } catch (err) {
      setToast({ tipo: 'error', mensaje: err.mensaje || err.message || 'Error al crear la reserva.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-x-0 top-20 z-[70] flex justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Formulario de reserva"
    >
      <div className="animate-modal-box w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-verde-bosque">Completá tu reserva</h3>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm font-semibold text-verde-bosque">{experiencia.titulo}</p>
          <p className="mt-1 text-sm text-cafe">
            {formatearFechaCorta(fechaInicio)}
            {fechaFin ? ` → ${formatearFechaCorta(fechaFin)}` : ''}
            {esHospedaje ? ` · ${noches} noche${noches > 1 ? 's' : ''}` : ` · ${numPersonas} persona${numPersonas > 1 ? 's' : ''}`}
          </p>
          <p className="mt-2 text-lg font-extrabold text-terracota">{formatoPrecio.format(precioTotal)}</p>
        </div>

        {sesion ? (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="rounded-lg border border-verde-hoja/30 bg-verde-hoja/10 p-4">
              <p className="text-sm font-semibold text-verde-bosque">Vas a reservar como:</p>
              <p className="mt-1 text-base font-bold text-verde-bosque">
                {sesion.nombre} {sesion.apellido}
              </p>
              <p className="mt-0.5 text-sm text-cafe">{sesion.email}</p>
              {sesion.telefono && <p className="text-sm text-cafe">{sesion.telefono}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onCancelar}
                className="cursor-pointer flex-1 rounded-lg border border-cafe-claro bg-white px-4 py-2.5 text-sm font-semibold text-cafe-oscuro transition-colors hover:bg-neutral-50"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="cursor-pointer flex-1 rounded-lg bg-terracota px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-verde-bosque disabled:opacity-50"
              >
                {enviando ? 'Reservando...' : 'Confirmar reserva'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-terracota/40 bg-terracota/5 p-6 text-center">
            <p className="text-base font-semibold text-verde-bosque">
              Necesitás iniciar sesión para reservar
            </p>
            <p className="mt-1 text-sm text-cafe">
              Iniciá sesión o creá una cuenta para poder confirmar tu reserva.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                to="/login"
                className="cursor-pointer rounded-lg bg-terracota px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-verde-bosque"
              >
                Iniciar sesión
              </Link>
              <Link
                to="/registro"
                className="cursor-pointer rounded-lg border border-terracota px-6 py-2.5 text-sm font-bold text-terracota transition-colors hover:bg-terracota/10"
              >
                Registrarse
              </Link>
            </div>
          </div>
        )}

        <Toast mensaje={toast?.mensaje || ''} tipo={toast?.tipo || 'exito'} onCerrar={() => setToast(null)} />
      </div>
    </div>
  )
}
