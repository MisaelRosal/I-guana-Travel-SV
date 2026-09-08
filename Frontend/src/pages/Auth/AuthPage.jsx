import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api.js'
import Toast from '../../components/Toast.jsx'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      const mensaje = 'Correo y contraseña son obligatorios.'
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      return
    }
    setEnviando(true)
    try {
      const usuario = await api.post('/Auth/login', {
        email: email.trim(),
        password,
      })
      sessionStorage.setItem('iguana_usuario', JSON.stringify(usuario))
      window.dispatchEvent(new Event('auth-change'))
      setToast({ tipo: 'exito', mensaje: '¡Iniciaste sesión con éxito!' })
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      const mensajeError = err.mensaje || err.message || 'No se pudo iniciar sesión.'
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
          <h1 className="text-2xl font-bold text-verde-bosque">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-cafe">Bienvenido de nuevo a I Guana Travel SV</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-verde-bosque">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold text-verde-bosque">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
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
              {enviando ? 'Iniciando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-cafe">
          No tienes cuenta,{' '}
          <Link
            to="/registro"
            className="cursor-pointer font-semibold text-terracota transition-colors hover:text-verde-bosque"
          >
            Regístrate
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
