import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo.jsx'

const SESION_KEY = 'iguana_usuario'

function leerSesion() {
  try {
    return JSON.parse(sessionStorage.getItem(SESION_KEY) || 'null')
  } catch {
    return null
  }
}

const redes = [
  {
    name: 'Facebook',
    href: 'https://facebook.com',
    path: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07Z',
  },
  {
    name: 'Instagram',
    href: 'https://instagram.com',
    path: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.35 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23a3.7 3.7 0 0 1-.9 1.38c-.42.42-.82.68-1.38.9-.42.16-1.06.35-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.35-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.35 2.23-.41 1.27-.06 1.65-.07 4.85-.07ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13.67.66 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z',
  },
  {
    name: 'X',
    href: 'https://x.com',
    path: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z',
  },
]

export default function Footer() {
  const [usuario, setUsuario] = useState(leerSesion)

  useEffect(() => {
    const actualizar = () => setUsuario(leerSesion())
    window.addEventListener('auth-change', actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener('auth-change', actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [])

  const rol = usuario?.rol ?? ''
  const explorar = [{ to: '/', label: 'Inicio' }]
  if (rol !== 'anfitrion') {
    explorar.push({ to: '/reservas', label: 'Mis reservas' })
  }
  if (rol === 'anfitrion' || rol === 'administrador') {
    explorar.push({ to: '/panel', label: 'Panel operador' })
  }
  if (rol === 'administrador') {
    explorar.push({ to: '/admin', label: 'Panel admin' })
  }
  explorar.push({ to: '/hacerse-anfitrion', label: 'Conviértete en anfitrión' })

  return (
    <footer className="bg-cafe-oscuro text-crema/75 mt-16">
      <div className="mx-auto max-w-7xl px-4 py-12 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs leading-relaxed">
            Turismo y experiencias en El Salvador. Explorá, reservá y viví el país con
            anfitriones locales.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-3">Explorar</h3>
          <ul className="space-y-2">
            {explorar.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="cursor-pointer transition-colors hover:text-verde-hoja"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-3">Anfitriones</h3>
          <p className="leading-relaxed">
            ¿Quieres ofrecer tu experiencia?{' '}
            <Link
              to="/hacerse-anfitrion"
              className="cursor-pointer font-medium text-verde-hoja transition-colors hover:text-white"
            >
              Conviértete en anfitrión
            </Link>
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-3">Síguenos</h3>
          <div className="flex items-center gap-3">
            {redes.map((red) => (
              <a
                key={red.name}
                href={red.href}
                target="_blank"
                rel="noreferrer"
                aria-label={red.name}
                className="cursor-pointer rounded-full bg-white/10 p-2.5 text-crema transition-colors duration-200 hover:bg-verde-hoja hover:text-verde-bosque"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d={red.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs sm:flex-row">
          <p>© {new Date().getFullYear()} I Guana Travel SV. Todos los derechos reservados.</p>
          <p className="flex gap-4">
            <span className="cursor-pointer transition-colors hover:text-verde-hoja">
              Términos y condiciones
            </span>
            <span className="cursor-pointer transition-colors hover:text-verde-hoja">
              Privacidad
            </span>
          </p>
        </div>
      </div>
    </footer>
  )
}