import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { localePath } from '../../i18n/routes.jsx'
import { api } from '../../services/api.js'
import { restaurarSesion } from '../../services/session.js'
import Toast from '../../components/Toast.jsx'

export default function AuthPage() {
  // F2a (i18n-es-en): all frontend-owned copy comes from the `auth` namespace.
  // Backend `mensaje` values stay verbatim passthrough (localized-ui-content
  // spec) — only the fallback copy and the required-credentials validation
  // (frontend-owned) are resource keys here.
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      const mensaje = t('login.validation.required')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      return
    }
    setEnviando(true)
    try {
      // Login only proves who you are; the session object is rehydrated from
      // GET /api/auth/me (server-authoritative), not from the request/response.
      await api.post('/Auth/login', {
        email: email.trim(),
        password,
      })
      await restaurarSesion()
      setToast({ tipo: 'exito', mensaje: t('login.successToast') })
      // F5 (task 6.5): post-login landing follows the locale route table.
      setTimeout(() => navigate(localePath('catalog')), 1500)
    } catch (err) {
      const mensajeError = err.mensaje || err.message || t('login.genericError')
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
          <h1 className="text-2xl font-bold text-verde-bosque">{t('login.heading')}</h1>
          <p className="mt-1 text-sm text-cafe">{t('login.welcome')}</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-semibold text-verde-bosque">
                {t('login.emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('fields.emailPlaceholder')}
                autoComplete="email"
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-semibold text-verde-bosque">
                {t('login.passwordLabel')}
              </label>
<div className="relative">
                <input
                  id="password"
                  type={verPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('fields.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 pr-11 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors"
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
              {enviando ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-cafe">
          {t('login.noAccount')}{' '}
          <Link
            to={localePath('register')}
            className="cursor-pointer font-semibold text-terracota transition-colors hover:text-verde-bosque"
          >
            {t('login.registerLink')}
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
