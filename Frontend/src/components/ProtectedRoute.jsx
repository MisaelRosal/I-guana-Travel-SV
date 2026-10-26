import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { localePath } from '../i18n/routes.jsx'
import { leerSesionCache, restaurarSesion } from '../services/session.js'
import LoadingIguana from './LoadingIguana.jsx'

/**
 * Ruta protegida: exige sesión válida (cache + revalidación server).
 * Si no hay sesión → redirige a login con `?redirect=` para volver tras entrar.
 */
export default function ProtectedRoute({ children, rolesPermitidos }) {
  const { t } = useTranslation('common')
  const location = useLocation()
  const [usuario, setUsuario] = useState(() => leerSesionCache())
  const [verificando, setVerificando] = useState(true)

  useEffect(() => {
    let activo = true
    // Revalidar contra servidor en cada montaje (cookie HttpOnly)
    restaurarSesion().then((sesion) => {
      if (activo) setUsuario(sesion)
    })
    const onAuthChange = () => setUsuario(leerSesionCache())
    window.addEventListener('auth-change', onAuthChange)
    return () => {
      activo = false
      window.removeEventListener('auth-change', onAuthChange)
    }
  }, [])

  useEffect(() => {
    if (usuario !== undefined) setVerificando(false)
  }, [usuario])

  if (verificando) {
    return <LoadingIguana fullscreen message={t('loading.default')} />
  }

  if (!usuario) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${localePath('login')}?redirect=${redirect}`} replace />
  }

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    return <Navigate to={localePath('catalog')} replace />
  }

  return children
}