import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { obtenerReservas, confirmarReserva } from '../../services/reservas.js'
import Toast from '../../components/Toast.jsx'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const formatoFecha = new Intl.DateTimeFormat('es-SV', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const ESTILOS_ESTADO = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  confirmada: 'bg-green-100 text-green-800',
  completada: 'bg-blue-100 text-blue-800',
  cancelada: 'bg-red-100 text-red-800',
}

function TarjetaReserva({ reserva, onConfirmar }) {
  const [confirmando, setConfirmando] = useState(false)
  const publicacion = reserva.publicacion
  const titulo = publicacion?.titulo ?? `Publicación #${reserva.publicacionId}`

  const handlePagar = async () => {
    setConfirmando(true)
    try {
      await onConfirmar(reserva.id)
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-verde-bosque">{titulo}</h3>
          <p className="mt-1 text-sm text-cafe">
            Huésped: {reserva.nombreHuesped}
          </p>
          <p className="text-sm text-cafe">
            Email: {reserva.emailHuesped}
          </p>
          {reserva.telefonoHuesped && (
            <p className="text-sm text-cafe">Tel: {reserva.telefonoHuesped}</p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${ESTILOS_ESTADO[reserva.estado] ?? 'bg-gray-100 text-gray-800'}`}>
          {reserva.estado}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase text-cafe">Check-in</p>
          <p className="font-semibold text-verde-bosque">
            {formatoFecha.format(new Date(reserva.fechaInicio))}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-cafe">Check-out</p>
          <p className="font-semibold text-verde-bosque">
            {formatoFecha.format(new Date(reserva.fechaFin))}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-cafe">Huéspedes</p>
          <p className="font-semibold text-verde-bosque">{reserva.numeroHuespedes}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-cafe">Total</p>
          <p className="font-bold text-terracota">{formatoPrecio.format(reserva.precioTotal)}</p>
        </div>
      </div>

      {reserva.estado === 'pendiente' && (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handlePagar}
            disabled={confirmando}
            className="flex-1 cursor-pointer rounded-lg bg-terracota px-4 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
          >
            {confirmando ? 'Procesando...' : 'Pagar'}
          </button>
          <Link
            to={`/experiencias/${reserva.publicacionId}`}
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-center text-sm font-semibold text-verde-bosque hover:bg-neutral-50 transition-colors"
          >
            Ver detalle
          </Link>
        </div>
      )}

      {reserva.estado === 'confirmada' && (
        <div className="mt-4">
          <Link
            to={`/experiencias/${reserva.publicacionId}`}
            className="block w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-center text-sm font-semibold text-verde-bosque hover:bg-neutral-50 transition-colors"
          >
            Ver experiencia
          </Link>
        </div>
      )}
    </div>
  )
}

export default function ReservationsPage() {
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const usuario = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')

  useEffect(() => {
    if (!usuario) return
    let activo = true
    obtenerReservas()
      .then((data) => {
        if (!activo) return
        const email = usuario.email?.toLowerCase()
        const filtradas = data.filter((r) => r.emailHuesped?.toLowerCase() === email)
        setReservas(filtradas)
      })
      .catch((e) => {
        if (activo) setError(e.message)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [])

  const handleConfirmar = async (id) => {
    try {
      const resultado = await confirmarReserva(id)
      setReservas((prev) =>
        prev.map((r) => (r.id === id ? { ...r, estado: 'confirmada' } : r))
      )
      setToast({ tipo: 'exito', mensaje: resultado?.mensaje ?? 'Reserva confirmada exitosamente.' })
    } catch (e) {
      setToast({ tipo: 'error', mensaje: e.mensaje || e.message || 'No se pudo confirmar la reserva.' })
    }
  }

  if (!usuario) {
    return (
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-verde-bosque mb-4">Mis reservas</h1>
        <p className="text-cafe mb-4">Debes iniciar sesión para ver tus reservas.</p>
        <Link
          to="/login"
          className="inline-block rounded-lg bg-terracota px-4 py-2 font-semibold text-white hover:bg-verde-bosque transition-colors"
        >
          Iniciar sesión
        </Link>
      </main>
    )
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-verde-bosque mb-4">Mis reservas</h1>

      {cargando && <p className="text-cafe">Cargando reservas...</p>}
      {error && <p className="text-terracota">Error: {error}</p>}

      {!cargando && !error && reservas.length === 0 && (
        <div className="text-center py-12">
          <p className="text-cafe mb-4">No tienes reservas aún.</p>
          <Link
            to="/"
            className="inline-block rounded-lg bg-terracota px-4 py-2 font-semibold text-white hover:bg-verde-bosque transition-colors"
          >
            Explorar experiencias
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reservas.map((r) => (
          <TarjetaReserva key={r.id} reserva={r} onConfirmar={handleConfirmar} />
        ))}
      </div>

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </main>
  )
}
