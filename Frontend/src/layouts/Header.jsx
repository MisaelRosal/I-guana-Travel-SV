import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '../components/Logo.jsx'
import { esAdmin, getMiPerfil } from '../services/anfitriones.js'
import { leerSesionCache, restaurarSesion, cerrarSesion as cerrarSesionEnServidor } from '../services/session.js'

// NOTE (W3a): the role/name read from the session here drives VISIBILITY only
// (which links/buttons to show). It is a UI convenience backed by the cache that
// revalidates against GET /api/auth/me. The AUTHORITATIVE check is the server:
// protected endpoints are enforced by authentication + the role/ownership matrix
// added in W3b — never rely on this client-side value to grant access.
function iniciales(nombre, apellido) {
  const n = (nombre || '').trim()
  const a = (apellido || '').trim()
  return ((n.charAt(0) || '') + (a.charAt(0) || '')).toUpperCase()
}

// F0 (i18n-es-en): ES/EN language pill (AD-5), rendered in both the desktop
// and the mobile nav. Reuses the nav-link styling classes; accessible names
// come from the `header` namespace. The handler is just changeLanguage —
// persistence and cross-tab sync are handled by the single listeners in
// src/i18n/config.js, so the toggle never writes storage or reloads itself.
function ToggleIdioma() {
  const { t, i18n } = useTranslation('header')
  const activo = i18n.language === 'en' ? 'en' : 'es'
  const clasePill = (lng) =>
    `cursor-pointer text-sm px-3 py-2 rounded-md transition-colors ${
      lng === activo
        ? 'bg-white/15 text-white'
        : 'text-crema/85 hover:text-white hover:bg-white/10'
    }`
  return (
    <div role="group" aria-label={t('langToggle.group')} className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => { i18n.changeLanguage('es') }}
        aria-pressed={activo === 'es'}
        aria-label={t('langToggle.switchToEs')}
        className={clasePill('es')}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => { i18n.changeLanguage('en') }}
        aria-pressed={activo === 'en'}
        aria-label={t('langToggle.switchToEn')}
        className={clasePill('en')}
      >
        EN
      </button>
    </div>
  )
}

export default function Header() {
  const [usuario, setUsuario] = useState(leerSesionCache)
  const [fotoPerfil, setFotoPerfil] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const actualizar = () => {
      setUsuario(leerSesionCache())
      setFotoPerfil('')
      setMenuAbierto(false)
    }
    window.addEventListener('auth-change', actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener('auth-change', actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [])

  // On first paint, revalidate the cached session against the server. An expired
  // or forged cookie makes /me return 401, so a stale cache is cleared here.
  useEffect(() => {
    let activo = true
    restaurarSesion().then((sesion) => {
      if (activo) setUsuario(sesion)
    })
    return () => { activo = false }
  }, [])

  useEffect(() => {
    const cerrarConEscape = (e) => {
      if (e.key === 'Escape') {
        setMenuAbierto(false)
        setMenuMovilAbierto(false)
      }
    }
    const cerrarConClickFuera = (e) => {
      if (menuAbierto && !e.target.closest('[data-menu-usuario]')) setMenuAbierto(false)
      if (menuMovilAbierto && !e.target.closest('[data-menu-movil]')) setMenuMovilAbierto(false)
    }
    window.addEventListener('keydown', cerrarConEscape)
    window.addEventListener('click', cerrarConClickFuera)
    return () => {
      window.removeEventListener('keydown', cerrarConEscape)
      window.removeEventListener('click', cerrarConClickFuera)
    }
  }, [menuAbierto, menuMovilAbierto])

  useEffect(() => {
    let activo = true
    if (usuario?.rol === 'anfitrion') {
      if (usuario.fotoPerfil) {
        setFotoPerfil(usuario.fotoPerfil)
      } else {
        // W4: the own row is resolved server-side through GET mi-perfil; the
        // public /Anfitrione list no longer exposes usuarioId, so the old
        // list+find lookup is gone. A 404 (no host row) keeps the initials
        // fallback — same end state as the previous find returning undefined.
        getMiPerfil()
          .then((perfil) => {
            if (activo) setFotoPerfil(perfil?.fotoPerfil || '')
          })
          .catch(() => {})
      }
    } else {
      setFotoPerfil('')
    }
    return () => { activo = false }
  }, [usuario?.rol, usuario?.id, usuario?.fotoPerfil])

  const rol = usuario?.rol ?? ''
  const links = [
    { to: '/', label: 'Inicio' },
  ]
  links.push({ to: '/reservas', label: 'Mis reservas' })
  if (rol === 'anfitrion') {
    links.push({ to: '/panel', label: 'Panel operador' })
  }
  if (esAdmin(rol)) {
    links.push({ to: '/admin', label: 'Panel admin' })
  }

  const cerrarSesion = async () => {
    // Ask the server to expire the auth + CSRF cookies, then drop the UI cache.
    await cerrarSesionEnServidor()
    setUsuario(null)
    setMenuAbierto(false)
    setMenuMovilAbierto(false)
    navigate('/')
  }

  const claseNavLink = ({ isActive }) =>
    `text-sm px-3 py-2 rounded-md transition-colors ${
      isActive
        ? 'bg-white/15 text-white'
        : 'text-crema/85 hover:text-white hover:bg-white/10'
    }`

  return (
    <header className="bg-verde-bosque text-white sticky top-0 z-20 shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4" data-menu-movil>
        <Link to="/" aria-label="I Guana Travel SV">
          <Logo />
        </Link>

        <nav className="hidden md:flex items-center gap-4" aria-label="Navegación principal">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={claseNavLink}
            >
              {link.label}
            </NavLink>
          ))}
          <ToggleIdioma />
          {usuario ? (
            <div className="relative flex items-center gap-3" data-menu-usuario>
              <button
                type="button"
                onClick={() => setMenuAbierto((v) => !v)}
                aria-expanded={menuAbierto}
                aria-haspopup="menu"
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-white/10"
              >
                <span
                  className="h-9 w-9 flex items-center justify-center overflow-hidden rounded-full border-2 border-white/70 text-sm font-bold text-verde-bosque bg-white shadow-sm"
                  title={usuario.nombre + ' ' + (usuario.apellido || '')}
                >
                  {esAdmin(rol) ? (
                    <span className="bg-terracota text-white flex h-full w-full items-center justify-center">AD</span>
                  ) : rol === 'anfitrion' && fotoPerfil ? (
                    <img src={fotoPerfil} alt="Foto de perfil" className="h-full w-full object-cover" />
                  ) : (
                    iniciales(usuario.nombre, usuario.apellido)
                  )}
                </span>
                <span className="text-sm font-medium text-white/90">{usuario.nombre} {usuario.apellido}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 text-white/70 transition-transform ${menuAbierto ? 'rotate-180' : ''}`} aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {menuAbierto && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-lg border border-cafe-claro/40 bg-white shadow-lg">
                  {rol === 'anfitrion' && (
                    <Link
                      to="/mi-perfil"
                      role="menuitem"
                      onClick={() => setMenuAbierto(false)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-cafe transition-colors hover:bg-crema hover:text-verde-bosque"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                      </svg>
                      Mi perfil
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={cerrarSesion}
                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-cafe transition-colors hover:bg-crema hover:text-verde-bosque"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="cursor-pointer text-sm px-4 py-2 rounded-md bg-terracota text-white font-semibold hover:bg-[#00B4D8] hover:text-verde-bosque transition-colors"
            >
              Iniciar sesión
            </Link>
          )}
        </nav>

        <button
          type="button"
          onClick={() => setMenuMovilAbierto((v) => !v)}
          aria-expanded={menuMovilAbierto}
          aria-controls="menu-movil"
          aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
          className="md:hidden flex cursor-pointer items-center justify-center rounded-lg p-2 text-white/90 transition-colors hover:bg-white/10"
        >
          {menuMovilAbierto ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {menuMovilAbierto && (
        <nav
          id="menu-movil"
          aria-label="Menú móvil"
          className="md:hidden border-t border-white/10 bg-verde-bosque px-4 pb-4 pt-3 shadow-lg"
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMenuMovilAbierto(false)}
                className={claseNavLink}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="mt-3">
            <ToggleIdioma />
          </div>

          <div className="mt-3 border-t border-white/10 pt-3">
            {usuario ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="h-10 w-10 flex items-center justify-center overflow-hidden rounded-full border-2 border-white/70 text-sm font-bold text-verde-bosque bg-white shadow-sm"
                    title={usuario.nombre + ' ' + (usuario.apellido || '')}
                  >
                    {esAdmin(rol) ? (
                      <span className="bg-terracota text-white flex h-full w-full items-center justify-center">AD</span>
                    ) : rol === 'anfitrion' && fotoPerfil ? (
                      <img src={fotoPerfil} alt="Foto de perfil" className="h-full w-full object-cover" />
                    ) : (
                      iniciales(usuario.nombre, usuario.apellido)
                    )}
                  </span>
                  <span className="text-sm font-medium text-white/90">
                    {usuario.nombre} {usuario.apellido}
                  </span>
                </div>
                {rol === 'anfitrion' && (
                  <Link
                    to="/mi-perfil"
                    onClick={() => setMenuMovilAbierto(false)}
                    className="text-sm px-3 py-2 rounded-md text-crema/85 hover:text-white hover:bg-white/10"
                  >
                    Mi perfil
                  </Link>
                )}
                <button
                  type="button"
                  onClick={cerrarSesion}
                  className="cursor-pointer text-sm px-3 py-2 rounded-md text-left text-crema/85 hover:text-white hover:bg-white/10"
                >
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMenuMovilAbierto(false)}
                className="block cursor-pointer text-center text-sm px-4 py-2 rounded-md bg-terracota text-white font-semibold transition-colors"
              >
                Iniciar sesión
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}