import { Link, NavLink } from 'react-router-dom'
import Logo from '../components/Logo.jsx'

const links = [
  { to: '/', label: 'Inicio' },
  { to: '/reservas', label: 'Mis reservas' },
  { to: '/panel', label: 'Panel operador' },
]

export default function Header() {
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
          <Link
            to="/login"
            className="cursor-pointer text-sm px-4 py-2 rounded-md bg-terracota text-white font-semibold hover:bg-[#00B4D8] hover:text-verde-bosque transition-colors"
          >
            Iniciar sesión
          </Link>
        </nav>
      </div>
    </header>
  )
}