import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api.js'
import { restaurarSesion } from '../../services/session.js'
import Toast from '../../components/Toast.jsx'

const estilosInput =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'

const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/
const soloTelefono = (valor) => valor.replace(/[^0-9+()\-\s]/g, '')

export default function RegisterPage() {
  // F2a (i18n-es-en): `auth` namespace (shared with AuthPage). Validation copy
  // is frontend-owned and extracted; API `mensaje` passthrough stays verbatim.
  const { t } = useTranslation('auth')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)
  const [errores, setErrores] = useState({})
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const validar = () => {
    const nuevos = {}

    if (!nombre.trim()) {
      nuevos.nombre = t('register.errors.nombreRequired')
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(nombre.trim())) {
      nuevos.nombre = t('register.errors.nombreLetters')
    }

    if (!apellido.trim()) {
      nuevos.apellido = t('register.errors.apellidoRequired')
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(apellido.trim())) {
      nuevos.apellido = t('register.errors.apellidoLetters')
    }

    if (!telefono.trim()) {
      nuevos.telefono = t('register.errors.telefonoRequired')
    } else if (!/^[0-9+()\-\s]{7,}$/.test(telefono.trim())) {
      nuevos.telefono = t('register.errors.telefonoChars')
    } else {
      const digitos = (telefono.match(/\d/g) ?? []).length
      if (digitos < 8) {
        nuevos.telefono = t('register.errors.telefonoDigits')
      }
    }

    if (!email.trim()) {
      nuevos.email = t('register.errors.emailRequired')
    } else if (!emailRegex.test(email.trim())) {
      nuevos.email = t('register.errors.emailInvalid')
    }

    if (!password) {
      nuevos.password = t('register.errors.passwordRequired')
    } else if (password.length < 6) {
      nuevos.password = t('register.errors.passwordLength')
    }

    if (!confirmar) {
      nuevos.confirmar = t('register.errors.confirmRequired')
    } else if (password !== confirmar) {
      nuevos.confirmar = t('register.errors.confirmMismatch')
    }

    setErrores(nuevos)
    return nuevos
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const erroresEncontrados = validar()
    if (Object.keys(erroresEncontrados).length > 0) {
      const primer = Object.values(erroresEncontrados)[0]
      setError(primer)
      setToast({ tipo: 'error', mensaje: primer })
      return
    }
    setEnviando(true)
    try {
      // Create the account, then rehydrate the session from GET /api/auth/me
      // (server-authoritative) rather than trusting the POST body as a session.
      await api.post('/Auth/register', {
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        telefono: telefono.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      await restaurarSesion()
      setToast({ tipo: 'exito', mensaje: t('register.successToast') })
      setTimeout(() => navigate('/'), 1500)
    } catch (err) {
      const mensajeError = err.mensaje || err.message || t('register.genericError')
      setError(mensajeError)
      setToast({ tipo: 'error', mensaje: mensajeError })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-cafe-claro/60 bg-white p-5 shadow-md sm:p-8">
          <h1 className="text-2xl font-bold text-verde-bosque">{t('register.heading')}</h1>
          <p className="mt-1 text-sm text-cafe">{t('register.subtitle')}</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="nombre" className="mb-1 block text-sm font-semibold text-verde-bosque">
                  {t('register.nombreLabel')}
                </label>
                <input
                  id="nombre"
                  type="text"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value)
                    if (errores.nombre) setErrores((prev) => ({ ...prev, nombre: '' }))
                  }}
                  placeholder={t('register.nombrePlaceholder')}
                  autoComplete="given-name"
                  required
                  className={estilosInput}
                />
                {errores.nombre && <p className="mt-1 text-xs font-medium text-red-600">{errores.nombre}</p>}
              </div>
              <div>
                <label htmlFor="apellido" className="mb-1 block text-sm font-semibold text-verde-bosque">
                  {t('register.apellidoLabel')}
                </label>
                <input
                  id="apellido"
                  type="text"
                  value={apellido}
                  onChange={(e) => {
                    setApellido(e.target.value)
                    if (errores.apellido) setErrores((prev) => ({ ...prev, apellido: '' }))
                  }}
                  placeholder={t('register.apellidoPlaceholder')}
                  autoComplete="family-name"
                  required
                  className={estilosInput}
                />
                {errores.apellido && <p className="mt-1 text-xs font-medium text-red-600">{errores.apellido}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="telefono" className="mb-1 block text-sm font-semibold text-verde-bosque">
                {t('register.telefonoLabel')}
              </label>
              <input
                id="telefono"
                type="tel"
                value={telefono}
                onChange={(e) => {
                  setTelefono(soloTelefono(e.target.value))
                  if (errores.telefono) setErrores((prev) => ({ ...prev, telefono: '' }))
                }}
                placeholder={t('register.telefonoPlaceholder')}
                autoComplete="tel"
                required
                className={estilosInput}
              />
              {errores.telefono && <p className="mt-1 text-xs font-medium text-red-600">{errores.telefono}</p>}
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-verde-bosque">
                {t('register.emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value.toLowerCase())
                  if (errores.email) setErrores((prev) => ({ ...prev, email: '' }))
                }}
                placeholder={t('fields.emailPlaceholder')}
                autoComplete="email"
                required
                className={estilosInput}
              />
              {errores.email && <p className="mt-1 text-xs font-medium text-red-600">{errores.email}</p>}
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold text-verde-bosque">
                {t('register.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={verPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (errores.password) setErrores((prev) => ({ ...prev, password: '' }))
                  }}
                  placeholder={t('register.passwordPlaceholder')}
                  autoComplete="new-password"
                  required
                  className={estilosInput + ' pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? t('fields.hidePassword') : t('fields.showPassword')}
                  className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-neutral-400 transition-colors hover:text-verde-bosque"
                >
                  {verPassword ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errores.password && <p className="mt-1 text-xs font-medium text-red-600">{errores.password}</p>}
            </div>
            <div>
              <label htmlFor="confirmar" className="mb-1 block text-sm font-semibold text-verde-bosque">
                {t('register.confirmLabel')}
              </label>
              <div className="relative">
                <input
                  id="confirmar"
                  type={verConfirmar ? 'text' : 'password'}
                  value={confirmar}
                  onChange={(e) => {
                    setConfirmar(e.target.value)
                    if (errores.confirmar) setErrores((prev) => ({ ...prev, confirmar: '' }))
                  }}
                  placeholder={t('register.confirmPlaceholder')}
                  autoComplete="new-password"
                  required
                  className={estilosInput + ' pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setVerConfirmar((v) => !v)}
                  aria-label={verConfirmar ? t('fields.hidePassword') : t('fields.showPassword')}
                  className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-neutral-400 transition-colors hover:text-verde-bosque"
                >
                  {verConfirmar ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errores.confirmar && <p className="mt-1 text-xs font-medium text-red-600">{errores.confirmar}</p>}
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
              {enviando ? t('register.submitting') : t('register.submit')}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-cafe">
          {t('register.haveAccount')}{' '}
          <Link
            to="/login"
            className="cursor-pointer font-semibold text-terracota transition-colors hover:text-verde-bosque"
          >
            {t('register.loginLink')}
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
