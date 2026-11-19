import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { localePath } from '../../i18n/routes.jsx'
import { api } from '../../services/api.js'
import Toast from '../../components/Toast.jsx'

const estilosInput =
  'w-full rounded-full border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-verde-hoja focus:outline-none focus:ring-2 focus:ring-verde-hoja/40 transition-colors'

const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

// Flujo de recuperación de contraseña: reutiliza el mismo mecanismo de código
// de 6 dígitos enviado por correo que la verificación de registro. El backend
// valida el código Y la contraseña nueva en un solo paso
// (POST /Auth/restablecer-password), por lo que la pantalla tiene dos pasos:
// pedir el código y luego canjearlo por la contraseña nueva. La respuesta del
// servidor es idéntica exista o no la cuenta (sin enumeración de usuarios),
// así que el mensaje de éxito se muestra tal cual, sin adivinar resultados.
export default function PasswordResetPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()

  const [paso, setPaso] = useState('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [toast, setToast] = useState(null)

  const soloDigitos = (valor) => valor.replace(/[^0-9]/g, '').slice(0, 6)

  // Paso 1: pedir el código. El servidor siempre responde el mismo mensaje.
  const handleSolicitar = async (e) => {
    e.preventDefault()
    setError('')
    if (!emailRegex.test(email.trim())) {
      const mensaje = t('register.errors.emailInvalid')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      document.getElementById('email')?.focus()
      return
    }
    setEnviando(true)
    try {
      const r = await api.post('/Auth/solicitar-reset-password', { email: email.trim().toLowerCase() })
      setCodigo('')
      setPassword('')
      setConfirmar('')
      setPaso('codigo')
      setToast({ tipo: 'exito', mensaje: r?.mensaje || t('reset.request.sentToast') })
    } catch (err) {
      const mensajeError = err.mensaje || err.message || t('reset.request.genericError')
      setError(mensajeError)
      setToast({ tipo: 'error', mensaje: mensajeError })
    } finally {
      setEnviando(false)
    }
  }

  // Paso 2: canjear el código por la contraseña nueva. Al terminar, vuelta al
  // login para iniciar sesión con la contraseña recién creada.
  const handleRestablecer = async (e) => {
    e.preventDefault()
    setError('')
    if (codigo.length !== 6) {
      const mensaje = t('reset.form.codeLengthError')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      document.getElementById('codigo')?.focus()
      return
    }
    if (!password) {
      const mensaje = t('reset.form.errors.passwordRequired')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      document.getElementById('password')?.focus()
      return
    }
    if (password.length < 6) {
      const mensaje = t('reset.form.errors.passwordLength')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      document.getElementById('password')?.focus()
      return
    }
    if (!confirmar) {
      const mensaje = t('reset.form.errors.confirmRequired')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      document.getElementById('confirmar')?.focus()
      return
    }
    if (password !== confirmar) {
      const mensaje = t('reset.form.errors.confirmMismatch')
      setError(mensaje)
      setToast({ tipo: 'error', mensaje })
      document.getElementById('confirmar')?.focus()
      return
    }
    setEnviando(true)
    try {
      const r = await api.post('/Auth/restablecer-password', {
        email: email.trim().toLowerCase(),
        codigo,
        nuevaPassword: password,
      })
      setToast({ tipo: 'exito', mensaje: r?.mensaje || t('reset.form.successToast') })
      setTimeout(() => navigate(localePath('login')), 1500)
    } catch (err) {
      const mensajeError = err.mensaje || err.message || t('reset.form.genericError')
      setError(mensajeError)
      setToast({ tipo: 'error', mensaje: mensajeError })
    } finally {
      setEnviando(false)
    }
  }

  const handleReenviar = async () => {
    setError('')
    setReenviando(true)
    try {
      const r = await api.post('/Auth/reenviar-reset-password', { email: email.trim().toLowerCase() })
      setToast({ tipo: 'exito', mensaje: r?.mensaje || t('reset.form.resentToast') })
    } catch (err) {
      const mensajeError = err.mensaje || err.message || t('reset.form.resendFailed')
      setError(mensajeError)
      setToast({ tipo: 'error', mensaje: mensajeError })
    } finally {
      setReenviando(false)
    }
  }

  const handleVolver = () => {
    setPaso('email')
    setError('')
    setCodigo('')
    setPassword('')
    setConfirmar('')
  }

  return (
    <div className="flex justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-[22px] border border-cafe-claro/60 bg-white p-5 sm:p-8">
          {paso === 'email' ? (
            <>
              <h1 className="text-2xl font-bold text-verde-bosque">{t('reset.heading')}</h1>
              <p className="mt-1 text-sm text-cafe">{t('reset.request.subtitle')}</p>

              <form className="mt-6 space-y-4" onSubmit={handleSolicitar} noValidate>
                <div>
                  <label htmlFor="email" className="mb-1 block text-sm font-semibold text-verde-bosque">
                    {t('reset.request.emailLabel')}
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError('')
                    }}
                    placeholder={t('fields.emailPlaceholder')}
                    autoComplete="email"
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'reset-error' : undefined}
                    className={estilosInput}
                  />
                </div>

                {error && (
                  <p id="reset-error" role="alert" className="rounded-[22px] bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={enviando}
                  className="cursor-pointer w-full rounded-full bg-iguana-hondo px-4 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
                >
                  {enviando ? t('reset.request.sending') : t('reset.request.submit')}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-verde-bosque">{t('reset.form.heading')}</h1>
              <p className="mt-1 text-sm text-cafe">
                <Trans
                  ns="auth"
                  i18nKey="reset.form.intro"
                  values={{ email }}
                  components={{ strong: <span className="font-semibold break-all text-verde-bosque" /> }}
                />
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleRestablecer} noValidate>
                <div>
                  <label htmlFor="codigo" className="mb-1 block text-sm font-semibold text-verde-bosque">
                    {t('reset.form.codeLabel')}
                  </label>
                  <input
                    id="codigo"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={codigo}
                    onChange={(e) => {
                      setCodigo(soloDigitos(e.target.value))
                      if (error) setError('')
                    }}
                    placeholder="123456"
                    maxLength={6}
                    required
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'codigo-error' : undefined}
                    className={estilosInput + ' text-center text-2xl font-semibold tracking-[0.5em]'}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-semibold text-verde-bosque">
                    {t('reset.form.passwordLabel')}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={verPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (error) setError('')
                      }}
                      placeholder={t('reset.form.passwordPlaceholder')}
                      autoComplete="new-password"
                      required
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'password-error' : undefined}
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
                </div>
                <div>
                  <label htmlFor="confirmar" className="mb-1 block text-sm font-semibold text-verde-bosque">
                    {t('reset.form.confirmLabel')}
                  </label>
                  <div className="relative">
                    <input
                      id="confirmar"
                      type={verConfirmar ? 'text' : 'password'}
                      value={confirmar}
                      onChange={(e) => {
                        setConfirmar(e.target.value)
                        if (error) setError('')
                      }}
                      placeholder={t('reset.form.confirmPlaceholder')}
                      autoComplete="new-password"
                      required
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'confirmar-error' : undefined}
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
                </div>

                {error && (
                  <p id="codigo-error" role="alert" className="rounded-[22px] bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={enviando}
                  className="cursor-pointer w-full rounded-full bg-iguana-hondo px-4 py-2.5 font-semibold text-white hover:bg-verde-bosque transition-colors disabled:opacity-50"
                >
                  {enviando ? t('reset.form.submitting') : t('reset.form.submit')}
                </button>

                <button
                  type="button"
                  onClick={handleReenviar}
                  disabled={reenviando}
                  className="cursor-pointer w-full rounded-full border border-cafe-claro/60 bg-white px-4 py-2.5 font-semibold text-verde-bosque hover:bg-cafe-claro/20 transition-colors disabled:opacity-50"
                >
                  {reenviando ? t('reset.form.resending') : t('reset.form.resend')}
                </button>

                <button
                  type="button"
                  onClick={handleVolver}
                  className="cursor-pointer w-full text-center text-sm font-semibold text-cafe transition-colors hover:text-iguana-hondo"
                >
                  {t('reset.back')}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-cafe">
          <Link
            to={localePath('login')}
            className="cursor-pointer font-semibold text-iguana-hondo transition-colors hover:text-verde-bosque"
          >
            {t('reset.backToLogin')}
          </Link>
        </p>
      </div>

      <Toast
        mensaje={toast?.mensaje || ''}
        tipo={toast?.tipo || 'exito'}
        onCerrar={() => setToast(null)}
      />
    </div>
  )
}
