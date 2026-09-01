import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api.js'
import Toast from '../../components/Toast.jsx'

const estilosInput =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'

export default function RegisterPage() {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const validar = () => {
    if (!nombre.trim() || !apellido.trim() || !telefono.trim() || !email.trim() || !password || !confirmar) {
      return 'Todos los campos son obligatorios.'
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return 'Ingresá un correo electrónico válido.'
    }
    if (password.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres.'
    }
    if (password !== confirmar) {
      return 'Las contraseñas no coinciden.'
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const mensaje = validar()
    if (mensaje) {
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      return
    }
    setEnviando(true)
    try {
      const usuario = await api.post('/Auth/register', {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        email: email.trim(),
        password,
      })
      sessionStorage.setItem('iguana_usuario', JSON.stringify(usuario))
      setToast({ tipo: 'exito', mensaje: '¡Cuenta creada con éxito!' })
      setTimeout(() => navigate('/panel'), 1500)
    } catch (err) {
      const mensajeError = err.mensaje || err.message || 'Error al crear la cuenta. Intentalo de nuevo.'
      setError(mensajeError)
      setToast({ tipo: 'error', mensaje: mensajeError })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-cafe-claro/60 bg-white p-8 shadow-md">
          <h1 className="text-2xl font-bold text-verde-bosque">Regístrate</h1>
          <p className="mt-1 text-sm text-cafe">Crea tu cuenta en I Guana Travel SV</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="nombre" className="mb-1 block text-sm font-semibold text-verde-bosque">
                  Nombre *
                </label>
                <input
                  id="nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="given-name"
                  required
                  className={estilosInput}
                />
              </div>
              <div>
                <label htmlFor="apellido" className="mb-1 block text-sm font-semibold text-verde-bosque">
                  Apellido *
                </label>
                <input
                  id="apellido"
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  placeholder="Tu apellido"
                  autoComplete="family-name"
                  required
                  className={estilosInput}
                />
              </div>
            </div>
            <div>
              <label htmlFor="telefono" className="mb-1 block text-sm font-semibold text-verde-bosque">
                Número de teléfono *
              </label>
              <input
                id="telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+503 7000 0000"
                autoComplete="tel"
                required
                className={estilosInput}
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-verde-bosque">
                Correo electrónico *
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
                className={estilosInput}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold text-verde-bosque">
                Contraseña *
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                required
                className={estilosInput}
              />
            </div>
            <div>
              <label htmlFor="confirmar" className="mb-1 block text-sm font-semibold text-verde-bosque">
                Confirmar contraseña *
              </label>
              <input
                id="confirmar"
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repite la contraseña"
                autoComplete="new-password"
                required
                className={estilosInput}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="cursor-pointer w-full rounded-lg bg-terracota px-4 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
            >
              {enviando ? 'Registrando...' : 'Registrarse'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-cafe">
          ¿Ya tienes cuenta?,{' '}
          <Link
            to="/login"
            className="cursor-pointer font-semibold text-terracota transition-colors hover:text-verde-bosque"
          >
            Inicia sesión
          </Link>
        </p>
      </div>

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </main>
  )
}
