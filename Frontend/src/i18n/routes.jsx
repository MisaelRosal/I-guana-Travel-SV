import { lazy } from 'react'
import i18n from './config.js'
import ProtectedRoute from '../components/ProtectedRoute.jsx'

// M-6 route-level code splitting: the PAGE COMPONENTS are lazy; the route
// table (keys, es/en paths and element structure) stays byte-identical so
// localePath(), the AD-1 alias contract and the table test keep working.
// React.lazy defers each screen's module to its first navigation; App.jsx
// wraps the rendered route elements in a shared <Suspense> fallback.
const CatalogPage = lazy(() => import('../pages/Catalog/CatalogPage.jsx'))
const ExperienceDetailPage = lazy(() => import('../pages/ExperienceDetail/ExperienceDetailPage.jsx'))
const AuthPage = lazy(() => import('../pages/Auth/AuthPage.jsx'))
const RegisterPage = lazy(() => import('../pages/Auth/RegisterPage.jsx'))
const PasswordResetPage = lazy(() => import('../pages/Auth/PasswordResetPage.jsx'))
const ReservationsPage = lazy(() => import('../pages/Reservations/ReservationsPage.jsx'))
const OperatorPanelPage = lazy(() => import('../pages/OperatorPanel/OperatorPanelPage.jsx'))
const SerAnfitrionPage = lazy(() => import('../pages/SerAnfitrion/SerAnfitrionPage.jsx'))
const AdminPanelPage = lazy(() => import('../pages/Admin/AdminPanelPage.jsx'))
const MiPerfilPage = lazy(() => import('../pages/MiPerfil/MiPerfilPage.jsx'))
const MiCuentaPage = lazy(() => import('../pages/MiCuenta/MiCuentaPage.jsx'))
const PerfilAnfitrionPage = lazy(() => import('../pages/PerfilAnfitrion/PerfilAnfitrionPage.jsx'))
const ChatPage = lazy(() => import('../pages/Chat/ChatPage.jsx'))

// F5 (i18n-es-en) task 6.2 — localized route table (AD-1: ALIAS, never
// redirect). Every screen owns one pair of URL forms; both are registered as
// real routes pointing at the SAME element, so an existing Spanish URL keeps
// resolving byte-identically under any locale (compatibility MUST) and an
// English alias renders the identical screen without any <Navigate> hop.
// `es`/`en` are react-router RELATIVE patterns (the pairs render inside the
// layout route in App.jsx); only the catalog owns the root as '/'. localePath
// below returns absolute URLs for Link/navigate consumers.
export const ROUTE_PAIRS = [
  { key: 'catalog', es: '/', en: '/', element: <CatalogPage /> },
  { key: 'experienceDetail', es: 'experiencias/:id', en: 'experiences/:id', element: <ExperienceDetailPage /> },
  { key: 'login', es: 'login', en: 'login', element: <AuthPage /> },
  { key: 'register', es: 'registro', en: 'register', element: <RegisterPage /> },
  { key: 'resetPassword', es: 'restablecer-password', en: 'reset-password', element: <PasswordResetPage /> },
  { key: 'reservations', es: 'reservas', en: 'bookings', element: <ProtectedRoute><ReservationsPage /></ProtectedRoute> },
  { key: 'panel', es: 'panel', en: 'panel', element: <ProtectedRoute rolesPermitidos={['anfitrion', 'admin']}><OperatorPanelPage /></ProtectedRoute> },
  { key: 'becomeHost', es: 'hacerse-anfitrion', en: 'become-a-host', element: <ProtectedRoute><SerAnfitrionPage /></ProtectedRoute> },
  { key: 'admin', es: 'admin', en: 'admin', element: <ProtectedRoute rolesPermitidos={['admin']}><AdminPanelPage /></ProtectedRoute> },
  { key: 'miPerfil', es: 'mi-perfil', en: 'my-profile', element: <ProtectedRoute rolesPermitidos={['anfitrion']}><MiPerfilPage /></ProtectedRoute> },
  { key: 'miCuenta', es: 'mi-cuenta', en: 'my-account', element: <ProtectedRoute><MiCuentaPage /></ProtectedRoute> },
  { key: 'mensajes', es: 'mensajes', en: 'messages', element: <ChatPage /> },
  { key: 'hostProfile', es: 'anfitriones/:id', en: 'hosts/:id', element: <PerfilAnfitrionPage /> },
]

// Absolute URL for the active locale with `:param` substitution. Reads
// `i18n.language` at CALL time, so a caller that re-renders on a locale
// change (every converted site uses useTranslation, directly or via its
// page) recomputes the right form. An unknown key is a programming mistake,
// not a user state: fail loudly instead of emitting a broken href.
export function localePath(key, params = {}) {
  const pair = ROUTE_PAIRS.find((p) => p.key === key)
  if (!pair) {
    throw new Error(`localePath: unknown route key "${key}"`)
  }
  const template = i18n.language === 'en' ? pair.en : pair.es
  const path = template === '/' ? '/' : `/${template}`
  return path.replace(/:([A-Za-z0-9_]+)/g, (_, name) =>
    params[name] != null ? String(params[name]) : '',
  )
}
