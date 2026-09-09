import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo.jsx'
import { api } from '../services/api.js'

const SESION_KEY = 'iguana_usuario'

function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(SESION_KEY) || 'null')
  } catch {
    return null
  }
}

function iniciales(nombre, apellido) {
  const n = (nombre || '').trim()
  const a = (apellido || '').trim()
  return ((n.charAt(0) || '') + (a.charAt(0) || '')).toUpperCase()
}

export default function Header() {
  const [usuario, setUsuario] = useState(leerSesion)
  const [fotoPerfil, setFotoPerfil] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const actualizar = () => {
      setUsuario(leerSesion())
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

  useEffect(() => {
    const cerrarConEscape = (e) => {
      if (e.key === 'Escape') setMenuAbierto(false)
    }
    const cerrarConClickFuera = (e) => {
      if (menuAbierto && !e.target.closest('[data-menu-usuario]')) setMenuAbierto(false)
    }
    window.addEventListener('keydown', cerrarConEscape)
    window.addEventListener('click', cerrarConClickFuera)
    return () => {
      window.removeEventListener('keydown', cerrarConEscape)
      window.removeEventListener('click', cerrarConClickFuera)
    }
  }, [menuAbierto])

  useEffect(() => {
    let activo = true
    if (usuario?.rol === 'anfitrion') {
      if (usuario.fotoPerfil) {
        setFotoPerfil(usuario.fotoPerfil)
      } else {
        api.get('/Anfitrione')
          .then((anfitriones) => {
            if (activo) {
              const propio = anfitriones.find((a) => a.usuarioId === usuario.id)
              setFotoPerfil(propio?.fotoPerfil || '')
            }
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
  if (rol !== 'anfitrion') {
    links.push({ to: '/reservas', label: 'Mis reservas' })
  }
  if (rol === 'anfitrion') {
    links.push({ to: '/panel', label: 'Panel operador' })
  }
  if (rol === 'administrador') {
    links.push({ to: '/admin', label: 'Panel admin' })
  }

  const cerrarSesion = () => {
    sessionStorage.removeItem(SESION_KEY)
    setUsuario(null)
    navigate('/')
  }

  return (
    <header className="bg-verde-bosque text-white sticky top-0 z-20 shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm px-3 py-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-crema/85 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
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
                  {rol === 'administrador' ? (
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
      </div>
    </header>
  )
}