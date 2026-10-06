import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n/config.js'
import RootLayout from './layouts/RootLayout.jsx'
import CatalogPage from './pages/Catalog/CatalogPage.jsx'
import ExperienceDetailPage from './pages/ExperienceDetail/ExperienceDetailPage.jsx'
import AuthPage from './pages/Auth/AuthPage.jsx'
import RegisterPage from './pages/Auth/RegisterPage.jsx'
import ReservationsPage from './pages/Reservations/ReservationsPage.jsx'
import OperatorPanelPage from './pages/OperatorPanel/OperatorPanelPage.jsx'
import SerAnfitrionPage from './pages/SerAnfitrion/SerAnfitrionPage.jsx'
import AdminPanelPage from './pages/Admin/AdminPanelPage.jsx'
import MiPerfilPage from './pages/MiPerfil/MiPerfilPage.jsx'
import PerfilAnfitrionPage from './pages/PerfilAnfitrion/PerfilAnfitrionPage.jsx'
import './css/app.css'

function App() {
  // F0 (i18n-es-en): <html lang> tracks the active locale (index.html keeps the
  // static lang="es" as the pre-JS default). The listener lives in the effect
  // so StrictMode remounts only re-register it; cleanup keeps it single.
  useEffect(() => {
    const sincronizarLang = (lng) => {
      document.documentElement.lang = lng === 'en' ? 'en' : 'es'
    }
    sincronizarLang(i18n.language)
    i18n.on('languageChanged', sincronizarLang)
    return () => {
      i18n.off('languageChanged', sincronizarLang)
    }
  }, [])

  return (
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<CatalogPage />} />
            <Route path="experiencias/:id" element={<ExperienceDetailPage />} />
            <Route path="login" element={<AuthPage />} />
            <Route path="registro" element={<RegisterPage />} />
            <Route path="reservas" element={<ReservationsPage />} />
            <Route path="panel" element={<OperatorPanelPage />} />
            <Route path="hacerse-anfitrion" element={<SerAnfitrionPage />} />
            <Route path="admin" element={<AdminPanelPage />} />
            <Route path="mi-perfil" element={<MiPerfilPage />} />
            <Route path="anfitriones/:id" element={<PerfilAnfitrionPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nextProvider>
  )
}

export default App
