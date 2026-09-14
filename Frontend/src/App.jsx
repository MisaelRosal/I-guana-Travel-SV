import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
  return (
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
  )
}

export default App
