import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMisReservas } from '../../services/reservas.js'

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

function TarjetaReserva({ reserva }) {
  const multinoche = reserva.fechaFin && reserva.fechaFin !== reserva.fechaInicio
  const rango = multinoche
    ? `${formatearFecha(reserva.fechaInicio)} → ${formatearFecha(reserva.fechaFin)}`
    : formatearFecha(reserva.fechaInicio)

  const coloresEstado = {
    pendiente: 'bg-amber/10 text-amber',
    confirmada: 'bg-verde-hoja/15 text-verde-bosque',
    cancelada: 'bg-red-50 text-red-600',
  }

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

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-verde-bosque/30 px-4 py-1.5 text-sm font-semibold text-verde-bosque transition-colors hover:bg-verde-bosque hover:text-white"
          >
            Editar
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
          >
            Eliminar
          </button>
        </div>
      </div>
    </article>
  )
}

export default function ReservationsPage() {
  const [reservas, setReservas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sesion, setSesion] = useState(null)

  useEffect(() => {
    const usuarioGuardado = JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
    setSesion(usuarioGuardado)

    if (!usuarioGuardado) {
      setCargando(false)
      return
    }

    let activo = true
    ;(async () => {
      try {
        const lista = await getMisReservas()
        if (activo) setReservas(lista)
      } catch (e) {
        if (activo) setReservas([])
      } finally {
        if (activo) setCargando(false)
      }
    })()

    return () => {
      activo = false
    }
  }, [])

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
            <TarjetaReserva key={reserva.id} reserva={reserva} />
          ))}
        </div>
      )}
    </main>
  )
}
