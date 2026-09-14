import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAnfitriones, actualizarPerfilAnfitrion, obtenerSesion } from '../../services/anfitriones.js'
import Toast from '../../components/Toast.jsx'

const inputCls = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'

function Avatar({ anfitrion }) {
  return (
    <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-crema text-4xl font-bold text-cafe shadow-md">
      {anfitrion.fotoPerfil ? (
        <img src={anfitrion.fotoPerfil} alt="Foto de perfil" className="h-full w-full object-cover" />
      ) : (
        (anfitrion.nombre || '').charAt(0).toUpperCase()
      )}
    </div>
  )
}

export default function MiPerfilPage() {
  const navigate = useNavigate()
  const usuario = obtenerSesion()
  const [anfitrion, setAnfitrion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (usuario?.rol !== 'anfitrion') {
      navigate('/')
      return
    }
    let activo = true
    getAnfitriones()
      .then((anfitriones) => {
        if (!activo) return
        const propio = anfitriones.find((a) => a.usuarioId === usuario.id) ?? null
        setAnfitrion(propio)
        setDescripcion(propio?.descripcion ?? '')
      })
      .catch(() => {})
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [usuario?.rol, usuario?.id, navigate])

  const guardar = async (e) => {
    e.preventDefault()
    if (!anfitrion) return
    setError('')
    setGuardando(true)
    try {
      await actualizarPerfilAnfitrion(anfitrion.id, { descripcion: descripcion.trim() })
      setAnfitrion((a) => ({ ...a, descripcion: descripcion.trim() }))
      setToast({ tipo: 'exito', mensaje: 'Perfil actualizado correctamente.' })
    } catch (err) {
      setError(err.mensaje || err.message || 'No se pudo actualizar el perfil.')
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <main className="flex justify-center px-4 py-20">
        <p className="text-cafe">Cargando perfil…</p>
      </main>
    )
  }

  if (!anfitrion) {
    return (
      <main className="flex justify-center px-4 py-20">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-verde-bosque">Mi perfil</h1>
          <p className="mt-3 text-cafe">No encontramos tu perfil de anfitrión.</p>
          <Link to="/hacerse-anfitrion" className="cursor-pointer mt-6 inline-block rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors">
            Conviértete en anfitrión
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link to="/" className="mb-4 block font-medium text-azul hover:text-azul-cielo">
        ← Volver al inicio
      </Link>

      <div className="rounded-xl border border-cafe-claro/60 bg-white p-8 shadow-md">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar anfitrion={anfitrion} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-verde-bosque">{anfitrion.nombre}</h1>
            <p className="mt-1 flex items-center justify-center gap-1 text-cafe sm:justify-start">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {anfitrion.municipio?.nombre ?? '—'}
              {anfitrion.municipio?.departamento ? `, ${anfitrion.municipio.departamento.nombre}` : ''}
            </p>
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${anfitrion.verificado ? 'bg-verde-hoja/15 text-verde-bosque' : 'bg-amber-100 text-amber-700'}`}>
              {anfitrion.verificado ? 'Verificado' : 'Pendiente de verificación'}
            </span>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-neutral-100 pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Correo</dt>
            <dd className="mt-0.5 text-neutral-800">{anfitrion.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Teléfono</dt>
            <dd className="mt-0.5 text-neutral-800">{anfitrion.telefono || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Dirección</dt>
            <dd className="mt-0.5 text-neutral-800">{anfitrion.direccion || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-cafe">Publicaciones</dt>
            <dd className="mt-0.5 text-neutral-800">{anfitrion.publicaciones?.length ?? 0}</dd>
          </div>
        </dl>

        <form className="mt-6 border-t border-neutral-100 pt-6" onSubmit={guardar} noValidate>
          <label htmlFor="mp-descripcion" className="block text-sm font-semibold text-verde-bosque mb-1">
            Breve descripción
          </label>
          <textarea
            id="mp-descripcion"
            className={inputCls + ' h-28 resize-none'}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Contanos quién sos y qué experiencia ofrecés..."
            required
          />
          {error && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
              {error}
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={guardando}
              className="cursor-pointer rounded-lg bg-terracota px-6 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </main>
  )
}