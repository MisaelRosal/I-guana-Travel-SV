import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { actualizarReserva, eliminarReserva, getMisReservas, pagarReserva, cancelarReserva } from '../../services/reservas.js'
import Toast from '../../components/Toast.jsx'

const etiquetasEstado = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
}

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const ESTILOS_ESTADO = {
  pendiente: 'bg-amber/10 text-amber',
  confirmada: 'bg-verde-hoja/15 text-verde-bosque',
  cancelada: 'bg-red-50 text-red-600',
  completada: 'bg-neutral-100 text-neutral-600',
}

const METODOS_PAGO = [
  { id: 'tarjeta_credito', label: 'Tarjeta de crédito' },
  { id: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { id: 'paypal', label: 'PayPal' },
]

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

function TarjetaReserva({ reserva, onEditar, onEliminar, onPagar, onCancelar }) {
  const multinoche = reserva.fechaFin && reserva.fechaFin !== reserva.fechaInicio
  const rango = multinoche
    ? `${formatearFecha(reserva.fechaInicio)} → ${formatearFecha(reserva.fechaFin)}`
    : formatearFecha(reserva.fechaInicio)

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
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${ESTILOS_ESTADO[reserva.estado] || 'bg-neutral-100 text-neutral-600'}`}
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {reserva.estado === 'pendiente' && onPagar && (
                <button
                  type="button"
                  onClick={() => onPagar(reserva.id)}
                  className="cursor-pointer rounded-lg bg-terracota px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque"
                >
                  Pagar
                </button>
              )}
              {reserva.estado === 'confirmada' && onCancelar && (
                <button
                  type="button"
                  onClick={() => onCancelar(reserva)}
                  className="cursor-pointer rounded-lg border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
                >
                  Cancelar
                </button>
              )}
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

function CalendarioFechas({ fechasDisponibles, seleccionada, onSeleccionar }) {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  const inicial = seleccionada || fechasDisponibles[0] || null
  const [mes, setMes] = useState(() => inicial ? parseInt(inicial.slice(5, 7), 10) - 1 : new Date().getMonth())
  const [anio, setAnio] = useState(() => inicial ? parseInt(inicial.slice(0, 4), 10) : new Date().getFullYear())

  const cambiarMes = (delta) => {
    let m = mes + delta
    let a = anio
    if (m < 0) { m = 11; a -= 1 }
    else if (m > 11) { m = 0; a += 1 }
    setMes(m)
    setAnio(a)
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const primerDia = new Date(anio, mes, 1)
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const offset = (primerDia.getDay() + 6) % 7

  const fechaISO = (d) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const celdas = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d)

  return (
    <div className="rounded-xl border border-cafe-claro bg-white p-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior" className="cursor-pointer rounded-lg p-1.5 text-terracota transition-colors hover:bg-terracota/10">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <p className="text-sm font-bold text-verde-bosque">{MESES[mes]} {anio}</p>
        <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente" className="cursor-pointer rounded-lg p-1.5 text-terracota transition-colors hover:bg-terracota/10">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {DIAS_CORTOS.map((d) => (
          <span key={d} className="py-1 text-center text-[10px] font-semibold uppercase text-cafe">{d}</span>
        ))}
        {celdas.map((dia, i) => {
          if (!dia) return <span key={`v-${i}`} className="block h-8" />
          const f = fechaISO(dia)
          const disponible = fechasDisponibles.includes(f)
          const esSeleccionada = f === seleccionada
          const pasado = new Date(anio, mes, dia).getTime() < hoy.getTime()
          const habilitado = disponible && !pasado
          return (
            <button
              key={dia}
              type="button"
              disabled={!habilitado}
              onClick={() => onSeleccionar(f)}
              className={`h-8 w-full rounded-lg text-xs font-semibold transition-colors ${
                esSeleccionada
                  ? 'bg-terracota text-white'
                  : habilitado
                    ? 'cursor-pointer text-neutral-700 hover:bg-terracota/10'
                    : 'cursor-not-allowed bg-neutral-100 text-neutral-400'
              }`}
            >
              {dia}
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-cafe">
        Solo se pueden elegir las fechas que ofrece el anfitrión.
      </p>
    </div>
  )
}

function ModalEditarReserva({ reserva, onCerrar, onGuardado }) {
  const esHospedaje = reserva.tipo === 'hospedaje'
  const fechasDisponibles = reserva.fechasDisponibles ?? []
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
      className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8"
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
          {esHospedaje ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-cafe">Entrada</span>
                <input
                  type="date"
                  required
                  min={todayISO()}
                  value={fechaInicio}
                  onChange={(e) => {
                    setFechaInicio(e.target.value)
                    if (fechaFin && e.target.value > fechaFin) setFechaFin(e.target.value)
                  }}
                  className="mt-1 w-full cursor-pointer rounded-lg border border-cafe-claro px-3 py-2 text-sm text-neutral-800 focus:border-terracota focus:outline-none"
                />
              </label>
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
            </div>
          ) : (
            <div>
              <span className="text-sm font-semibold text-cafe">Fecha</span>
              <p className="mb-2 mt-0.5 text-xs text-neutral-500">
                Fecha actual: {formatearFecha(reserva.fechaInicio)}
              </p>
              {fechasDisponibles.length === 0 ? (
                <p className="rounded-lg border border-dashed border-cafe-claro bg-neutral-50 px-3 py-4 text-center text-xs text-cafe">
                  Esta experiencia todavía no tiene fechas disponibles.
                </p>
              ) : (
                <CalendarioFechas
                  fechasDisponibles={fechasDisponibles}
                  seleccionada={fechaInicio}
                  onSeleccionar={setFechaInicio}
                />
              )}
            </div>
          )}

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
    <div className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="animate-modal-box w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
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
            <div className="flex flex-col gap-2 sm:flex-row">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetodoPago(m.id)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:flex-1 ${
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

function ModalCancelar({ reserva, onCerrar, onExito }) {
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState(null)

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fechaInicio = new Date(reserva.fechaInicio + 'T00:00:00')
  const yaEmpezada = fechaInicio <= hoy
  const esCompletada = reserva.estado === 'completada'
  const noSePuedeCancelar = yaEmpezada || esCompletada

  const motivo = yaEmpezada
    ? 'No se puede cancelar una reserva cuya fecha de inicio ya pasó o es hoy.'
    : 'No se puede cancelar una reserva que ya fue completada.'

  const handleCancelar = async () => {
    setProcesando(true)
    setError(null)

    try {
      await cancelarReserva(reserva.id)
      onExito(reserva.id)
    } catch (err) {
      setError(err.mensaje || err.message || 'Error al cancelar la reserva')
      setProcesando(false)
    }
  }

  return (
    <div className="animate-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
      <div className="animate-modal-box w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-terracota">Cancelar reserva</h2>
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="text-2xl leading-none text-cafe hover:text-terracota transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="mb-5 rounded-lg bg-red-50 p-4">
          {noSePuedeCancelar ? (
            <p className="text-sm text-red-700 font-semibold">{motivo}</p>
          ) : (
            <>
              <p className="text-sm text-cafe">¿Estás seguro que deseas cancelar esta reserva?</p>
              <p className="mt-2 text-sm font-semibold text-verde-bosque">
                Reserva #{reserva.id} — {formatoPrecio.format(reserva.precioTotal)}
              </p>
              <p className="text-xs text-cafe mt-1">
                Check-in: {formatearFecha(reserva.fechaInicio)}
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 p-2 text-center text-sm text-red-700">{error}</p>
        )}

        <div className="flex gap-3">
          {!noSePuedeCancelar && (
            <button
              type="button"
              onClick={handleCancelar}
              disabled={procesando}
              className="flex-1 cursor-pointer rounded-lg bg-terracota px-4 py-3 font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {procesando ? 'Cancelando...' : 'Sí, cancelar reserva'}
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            disabled={procesando}
            className="flex-1 cursor-pointer rounded-lg border border-neutral-300 px-4 py-3 font-semibold text-verde-bosque hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            {noSePuedeCancelar ? 'Cerrar' : 'No, mantener'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReservationsPage() {
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [sesion, setSesion] = useState(null)
  const [reservaEditar, setReservaEditar] = useState(null)
  const [reservaEliminar, setReservaEliminar] = useState(null)
  const [reservaPagar, setReservaPagar] = useState(null)
  const [reservaCancelar, setReservaCancelar] = useState(null)

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

  const handleExitoCancelacion = (id) => {
    setReservas((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, estado: 'cancelada' }
          : r
      )
    )
    setReservaCancelar(null)
    setToast({ tipo: 'exito', mensaje: 'Reserva cancelada exitosamente.' })
  }

  if (!cargando && !sesion) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-20 text-center">
        <h1 className="text-3xl font-bold text-verde-bosque">Mis reservas</h1>
        <p className="mt-1 text-cafe">Debes iniciar sesión para ver tus reservas.</p>
        <Link
          to="/login"
          className="mt-5 inline-block cursor-pointer rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
        >
          Iniciar sesión
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold text-verde-bosque">Mis reservas</h1>
      <p className="mt-1 text-cafe">Aquí vas a encontrar todas tus reservas.</p>

      {cargando ? (
        <p className="mt-8 text-cafe">Cargando tus reservas…</p>
      ) : error ? (
        <p className="mt-8 text-terracota">Error: {error}</p>
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
              onPagar={handleAbrirPago}
              onCancelar={setReservaCancelar}
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

      {reservaPagar && (
        <ModalPago
          reserva={reservaPagar}
          onCerrar={() => setReservaPagar(null)}
          onExito={handleExitoPago}
        />
      )}

      {reservaCancelar && (
        <ModalCancelar
          reserva={reservaCancelar}
          onCerrar={() => setReservaCancelar(null)}
          onExito={handleExitoCancelacion}
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