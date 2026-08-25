import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RootLayout from './layouts/RootLayout.jsx'
import CatalogPage from './pages/Catalog/CatalogPage.jsx'
import ExperienceDetailPage from './pages/ExperienceDetail/ExperienceDetailPage.jsx'
import AuthPage from './pages/Auth/AuthPage.jsx'
import ReservationsPage from './pages/Reservations/ReservationsPage.jsx'
import OperatorPanelPage from './pages/OperatorPanel/OperatorPanelPage.jsx'
import './css/app.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<CatalogPage />} />
          <Route path="experiencias/:id" element={<ExperienceDetailPage />} />
          <Route path="login" element={<AuthPage />} />
          <Route path="reservas" element={<ReservationsPage />} />
          <Route path="panel" element={<OperatorPanelPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
