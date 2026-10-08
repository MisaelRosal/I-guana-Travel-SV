import i18n from './config.js'
import CatalogPage from '../pages/Catalog/CatalogPage.jsx'
import ExperienceDetailPage from '../pages/ExperienceDetail/ExperienceDetailPage.jsx'
import AuthPage from '../pages/Auth/AuthPage.jsx'
import RegisterPage from '../pages/Auth/RegisterPage.jsx'
import ReservationsPage from '../pages/Reservations/ReservationsPage.jsx'
import OperatorPanelPage from '../pages/OperatorPanel/OperatorPanelPage.jsx'
import SerAnfitrionPage from '../pages/SerAnfitrion/SerAnfitrionPage.jsx'
import AdminPanelPage from '../pages/Admin/AdminPanelPage.jsx'
import MiPerfilPage from '../pages/MiPerfil/MiPerfilPage.jsx'
import PerfilAnfitrionPage from '../pages/PerfilAnfitrion/PerfilAnfitrionPage.jsx'

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
  { key: 'reservations', es: 'reservas', en: 'bookings', element: <ReservationsPage /> },
  { key: 'panel', es: 'panel', en: 'panel', element: <OperatorPanelPage /> },
  { key: 'becomeHost', es: 'hacerse-anfitrion', en: 'become-a-host', element: <SerAnfitrionPage /> },
  { key: 'admin', es: 'admin', en: 'admin', element: <AdminPanelPage /> },
  { key: 'miPerfil', es: 'mi-perfil', en: 'my-profile', element: <MiPerfilPage /> },
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
