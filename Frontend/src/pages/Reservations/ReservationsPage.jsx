import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { obtenerReservas, confirmarReserva, pagarReserva } from '../../services/reservas.js'
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

const METODOS_PAGO = [
  { id: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { id: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { id: 'paypal', label: 'PayPal' },
]

function ModalPago({ reserva, onCerrar, onExito }) {
  const [metodoPago, setMetodoPago] = useState('')
  const [numeroTarjeta, setNumeroTarjeta] = useState('')
  const [nombreTitular, setNombreTitular] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!metodoPago) {
      setError('Seleccioná un método de pago')
      return
    }
    if (metodoPago !== 'paypal' && !numeroTarjeta.trim()) {
      setError('Ingresá el número de tarjeta')
      return
    }
    if (metodoPago !== 'paypal' && !nombreTitular.trim()) {
      setError('Ingresá el nombre del titular')
      return
    }

    setProcesando(true)
    setError(null)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const resultado = await pagarReserva(reserva.id, metodoPago)
      onExito(resultado)
    } catch (err) {
      setError(err.mensaje || err.message || 'Error al procesar el pago')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-verde-bosque">Simular pago</h2>
          <button
            type="button"
            onClick={onCerrar}
            className="text-2xl leading-none text-cafe hover:text-terracota transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="mb-5 rounded-lg bg-neutral-50 p-4">
          <p className="text-sm text-cafe">Reserva #{reserva.id}</p>
          <p className="text-lg font-bold text-terracota">
            {formatoPrecio.format(reserva.precioTotal)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-verde-bosque">
              Método de pago
            </label>
            <div className="flex gap-2">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodoPago(m.id)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    metodoPago === m.id
                      ? 'border-terracota bg-terracota text-white'
                      : 'border-neutral-300 text-verde-bosque hover:bg-neutral-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {metodoPago && metodoPago !== 'paypal' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-semibold text-verde-bosque">
                  Número de tarjeta
                </label>
                <input
                  type="text"
                  value={numeroTarjeta}
                  onChange={(e) => setNumeroTarjeta(e.target.value)}
                  placeholder="**** **** **** ****"
                  maxLength={19}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-verde-bosque placeholder:text-neutral-400 focus:border-terracota focus:outline-none focus:ring-1 focus:ring-terracota"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-verde-bosque">
                  Nombre del titular
                </label>
                <input
                  type="text"
                  value={nombreTitular}
                  onChange={(e) => setNombreTitular(e.target.value)}
                  placeholder="Como aparece en la tarjeta"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-verde-bosque placeholder:text-neutral-400 focus:border-terracota focus:outline-none focus:ring-1 focus:ring-terracota"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-verde-bosque">
                  Vencimiento
                </label>
                <input
                  type="text"
                  value={vencimiento}
                  onChange={(e) => setVencimiento(e.target.value)}
                  placeholder="MM/AA"
                  maxLength={5}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-verde-bosque placeholder:text-neutral-400 focus:border-terracota focus:outline-none focus:ring-1 focus:ring-terracota"
                />
              </div>
            </>
          )}

          {metodoPago === 'paypal' && (
            <div className="rounded-lg bg-blue-50 p-3 text-center text-sm text-blue-800">
              Serás redirigido a PayPal para completar el pago.
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-center text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={procesando}
            className="w-full cursor-pointer rounded-lg bg-terracota px-4 py-3 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
          >
            {procesando ? 'Procesando pago...' : 'Confirmar pago'}
          </button>
        </form>
      </div>
    </div>
  )
}

function TarjetaReserva({ reserva, onPagar }) {
  const [confirmando, setConfirmando] = useState(false)
  const publicacion = reserva.publicacion
  const titulo = publicacion?.titulo ?? `Publicación #${reserva.publicacionId}`

  const handlePagar = async () => {
    setConfirmando(true)
    try {
      await onPagar(reserva.id)
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
            {confirmando ? 'Abriendo...' : 'Pagar'}
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
  const [reservaPagar, setReservaPagar] = useState(null)

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

  const handleAbrirPago = (id) => {
    const reserva = reservas.find((r) => r.id === id)
    if (reserva) setReservaPagar(reserva)
  }

  const handleExitoPago = (resultado) => {
    setReservas((prev) =>
      prev.map((r) =>
        r.id === resultado.id
          ? { ...r, estado: 'confirmada' }
          : r
      )
    )
    setReservaPagar(null)
    setToast({ tipo: 'exito', mensaje: resultado?.mensaje ?? 'Pago realizado exitosamente.' })
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
          <TarjetaReserva key={r.id} reserva={r} onPagar={handleAbrirPago} />
        ))}
      </div>

      {reservaPagar && (
        <ModalPago
          reserva={reservaPagar}
          onCerrar={() => setReservaPagar(null)}
          onExito={handleExitoPago}
        />
      )}

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </main>
  )
}
