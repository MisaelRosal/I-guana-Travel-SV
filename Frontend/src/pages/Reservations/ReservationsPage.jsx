import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { actualizarReserva, eliminarReserva, getMisReservas } from '../../services/reservas.js'
import Toast from '../../components/Toast.jsx'

const etiquetasEstado = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
}

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatearFecha(iso) {
  if (!iso) return ''
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

function fechaBloqueada(iso) {
  if (!iso) return false
  const [anio, mes, dia] = iso.split('-').map(Number)
  const objetivo = new Date(anio, mes - 1, dia)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const diasRestantes = Math.round((objetivo - hoy) / 86400000)
  return diasRestantes <= 1
}

function TarjetaReserva({ reserva, onEditar, onEliminar }) {
  const multinoche = reserva.fechaFin && reserva.fechaFin !== reserva.fechaInicio
  const rango = multinoche
    ? `${formatearFecha(reserva.fechaInicio)} → ${formatearFecha(reserva.fechaFin)}`
    : formatearFecha(reserva.fechaInicio)

  const coloresEstado = {
    pendiente: 'bg-amber/10 text-amber',
    confirmada: 'bg-verde-hoja/15 text-verde-bosque',
    cancelada: 'bg-red-50 text-red-600',
  }

  const cancelada = reserva.estado === 'cancelada'
  const bloqueada = fechaBloqueada(reserva.fechaInicio)

  return (
    <article className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md sm:flex-row">
      <img
        src={reserva.experienciaImagen}
        alt={reserva.experienciaTitulo}
        loading="lazy"
        className="h-40 w-full object-cover sm:h-auto sm:w-52 sm:shrink-0"
      />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-cafe">
              {reserva.experienciaCategoria}
            </span>
            <h3 className="text-lg font-bold text-verde-bosque">{reserva.experienciaTitulo}</h3>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${coloresEstado[reserva.estado] || 'bg-neutral-100 text-neutral-600'}`}
          >
            {etiquetasEstado[reserva.estado] || reserva.estado}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase text-cafe">Fecha</dt>
            <dd className="mt-0.5 font-medium text-neutral-800">
              {multinoche ? (
                <>
                  {formatearFecha(reserva.fechaInicio)} → {formatearFecha(reserva.fechaFin)}
                </>
              ) : (
                formatearFecha(reserva.fechaInicio)
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-cafe">Personas</dt>
            <dd className="mt-0.5 font-medium text-neutral-800">
              {reserva.personas} {reserva.personas === 1 ? 'persona' : 'personas'}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs font-semibold uppercase text-cafe">Total</dt>
            <dd className="mt-0.5 text-lg font-extrabold text-terracota">
              {formatoPrecio.format(reserva.precioTotal)}
            </dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-neutral-100 pt-4">
          {cancelada ? (
            <p className="text-sm text-neutral-500">Esta reserva ya fue cancelada.</p>
          ) : bloqueada ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <p className="text-xs text-amber">
                Falta un día o menos para tu entrada. Por eso esta reserva ya no se puede editar ni eliminar.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onEditar(reserva)}
                className="cursor-pointer rounded-lg border border-verde-bosque/30 px-4 py-1.5 text-sm font-semibold text-verde-bosque transition-colors hover:bg-verde-bosque hover:text-white"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => onEliminar(reserva)}
                className="cursor-pointer rounded-lg border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function todayISO() {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

function ModalEditarReserva({ reserva, onCerrar, onGuardado }) {
  const esHospedaje = reserva.tipo === 'hospedaje'
  const [fechaInicio, setFechaInicio] = useState(reserva.fechaInicio)
  const [fechaFin, setFechaFin] = useState(reserva.fechaFin || reserva.fechaInicio)
  const maxPersonas = reserva.capacidadMaxima || 1
  const [personas, setPersonas] = useState(() => Math.min(reserva.personas || 1, maxPersonas))
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState(null)
  const [errorFecha, setErrorFecha] = useState('')

  const noches = esHospedaje && fechaInicio && fechaFin
    ? Math.max(1, Math.round((new Date(`${fechaFin}T12:00:00`) - new Date(`${fechaInicio}T12:00:00`)) / 86400000))
    : 1
  const precioTotal = (reserva.precioPorNoche || 0) * (esHospedaje ? noches : personas)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!fechaInicio) {
      setErrorFecha('Elegí una fecha de inicio.')
      return
    }
    if (esHospedaje && fechaFin < fechaInicio) {
      setErrorFecha('La fecha de fin no puede ser anterior a la de inicio.')
      return
    }
    if (personas > maxPersonas) {
      setErrorFecha(`La capacidad máxima es de ${maxPersonas} ${maxPersonas === 1 ? 'persona' : 'personas'}.`)
      return
    }
    setErrorFecha('')
    setEnviando(true)
    try {
      await actualizarReserva({
        id: reserva.id,
        publicacionId: reserva.publicacionId,
        nombreHuesped: reserva.nombreHuesped,
        emailHuesped: reserva.emailHuesped,
        telefonoHuesped: reserva.telefonoHuesped,
        fechaInicio,
        fechaFin: esHospedaje ? fechaFin : fechaInicio,
        numeroHuespedes: personas,
        precioTotal,
      })
      setToast({ tipo: 'exito', mensaje: 'Reserva actualizada.' })
      setTimeout(() => onGuardado(), 1200)
    } catch (err) {
      setToast({ tipo: 'error', mensaje: err.mensaje || err.message || 'Error al actualizar la reserva.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar reserva"
    >
      <div className="animate-modal-box w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-verde-bosque">Editar reserva</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm font-semibold text-verde-bosque">{reserva.experienciaTitulo}</p>
          <p className="mt-1 text-sm text-cafe">
            {formatoPrecio.format(precioTotal)}
            {esHospedaje ? ` · ${noches} noche${noches > 1 ? 's' : ''}` : ` · ${personas} persona${personas > 1 ? 's' : ''}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-cafe">
                {esHospedaje ? 'Entrada' : 'Fecha'}
              </span>
              <input
                type="date"
                required
                min={todayISO()}
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value)
                  if (esHospedaje && fechaFin && e.target.value > fechaFin) setFechaFin(e.target.value)
                }}
                className="mt-1 w-full cursor-pointer rounded-lg border border-cafe-claro px-3 py-2 text-sm text-neutral-800 focus:border-terracota focus:outline-none"
              />
            </label>
            {esHospedaje ? (
              <label className="block">
                <span className="text-sm font-semibold text-cafe">Salida</span>
                <input
                  type="date"
                  required
                  min={fechaInicio || todayISO()}
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-cafe-claro px-3 py-2 text-sm text-neutral-800 focus:border-terracota focus:outline-none"
                />
              </label>
            ) : (
              <div className="flex flex-col justify-end pb-1">
                <p className="text-xs text-neutral-500">Experiencia de un día</p>
              </div>
            )}
          </div>

          {errorFecha && <p className="text-sm font-medium text-red-600">{errorFecha}</p>}

          <div>
            <span className="text-sm font-semibold text-cafe">Personas</span>
            <p className="mt-0.5 text-xs text-neutral-500">
              Capacidad máxima: {maxPersonas} {maxPersonas === 1 ? 'persona' : 'personas'}
            </p>
            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setPersonas((n) => Math.max(1, n - 1))}
                aria-label="Menos personas"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-terracota text-xl font-bold text-terracota transition-colors hover:bg-terracota/10"
              >
                −
              </button>
              <div className="w-16 text-center">
                <p className="text-3xl font-extrabold text-verde-bosque">{personas}</p>
                <p className="text-xs font-semibold uppercase text-cafe">
                  {personas === 1 ? 'persona' : 'personas'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPersonas((n) => Math.min(maxPersonas, n + 1))}
                aria-label="Más personas"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-terracota text-xl font-bold text-terracota transition-colors hover:bg-terracota/10"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCerrar}
              className="cursor-pointer flex-1 rounded-lg border border-cafe-claro bg-white px-4 py-2.5 text-sm font-semibold text-cafe-oscuro transition-colors hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="cursor-pointer flex-1 rounded-lg bg-terracota px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-verde-bosque disabled:opacity-50"
            >
              {enviando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>

        <Toast mensaje={toast?.mensaje || ''} tipo={toast?.tipo || 'exito'} onCerrar={() => setToast(null)} />
      </div>
    </div>
  )
}

function ModalConfirmarEliminar({ reserva, onCerrar, onEliminado }) {
  const [eliminando, setEliminando] = useState(false)
  const [toast, setToast] = useState(null)

  const handleEliminar = async () => {
    setEliminando(true)
    try {
      await eliminarReserva(reserva.id)
      setToast({ tipo: 'exito', mensaje: 'Reserva eliminada.' })
      setTimeout(() => onEliminado(), 1200)
    } catch (err) {
      setToast({ tipo: 'error', mensaje: err.mensaje || err.message || 'Error al eliminar la reserva.' })
      setEliminando(false)
    }
  }

  return (
    <div
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar eliminación"
    >
      <div className="animate-modal-box w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-verde-bosque">¿Eliminar reserva?</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mt-3 text-sm text-cafe">
          Vas a eliminar la reserva de <span className="font-semibold text-verde-bosque">{reserva.experienciaTitulo}</span> para el{' '}
          <span className="font-semibold text-verde-bosque">{formatearFecha(reserva.fechaInicio)}</span>. Esta acción no se puede deshacer.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCerrar}
            className="cursor-pointer flex-1 rounded-lg border border-cafe-claro bg-white px-4 py-2.5 text-sm font-semibold text-cafe-oscuro transition-colors hover:bg-neutral-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleEliminar}
            disabled={eliminando}
            className="cursor-pointer flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
        <Toast mensaje={toast?.mensaje || ''} tipo={toast?.tipo || 'exito'} onCerrar={() => setToast(null)} />
      </div>
    </div>
  )
}

export default function ReservationsPage() {
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState(null)
  const [reservaEditar, setReservaEditar] = useState(null)
  const [reservaEliminar, setReservaEliminar] = useState(null)

  const cargarReservas = async () => {
    try {
      const lista = await getMisReservas()
      setReservas(lista)
    } catch (e) {
      setReservas([])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    const usuarioGuardado = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
    setSesion(usuarioGuardado)

    if (!usuarioGuardado) {
      setCargando(false)
      return
    }

    cargarReservas()
  }, [])

  const cerrarEdicion = () => setReservaEditar(null)
  const cerrarEliminar = () => setReservaEliminar(null)

  const guardarEdicion = () => {
    setReservaEditar(null)
    cargarReservas()
  }

  const confirmarEliminacion = () => {
    setReservaEliminar(null)
    cargarReservas()
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold text-verde-bosque">Mis reservas</h1>
      <p className="mt-1 text-cafe">Aquí vas a encontrar todas tus reservas.</p>

      {cargando ? (
        <p className="mt-8 text-cafe">Cargando tus reservas…</p>
      ) : !sesion ? (
        <div className="mt-8 rounded-xl border border-dashed border-cafe-claro bg-white p-10 text-center">
          <p className="text-lg font-semibold text-verde-bosque">
            Inicia sesión para ver tus reservas
          </p>
          <p className="mt-1 text-sm text-cafe">
            Necesitás una cuenta para consultar y gestionar tus reservas.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-block cursor-pointer rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
          >
            Iniciar sesión
          </Link>
        </div>
      ) : reservas.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-cafe-claro bg-white p-10 text-center">
          <p className="text-lg font-semibold text-verde-bosque">Todavía no tenés reservas</p>
          <p className="mt-1 text-sm text-cafe">
            Cuando hagas una reserva, la vas a poder ver acá.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block cursor-pointer rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
          >
            Explorar experiencias
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {reservas.map((reserva) => (
            <TarjetaReserva
              key={reserva.id}
              reserva={reserva}
              onEditar={setReservaEditar}
              onEliminar={setReservaEliminar}
            />
          ))}
        </div>
      )}

      {reservaEditar && (
        <ModalEditarReserva
          reserva={reservaEditar}
          onCerrar={cerrarEdicion}
          onGuardado={guardarEdicion}
        />
      )}
      {reservaEliminar && (
        <ModalConfirmarEliminar
          reserva={reservaEliminar}
          onCerrar={cerrarEliminar}
          onEliminado={confirmarEliminacion}
        />
      )}
    </main>
  )
}