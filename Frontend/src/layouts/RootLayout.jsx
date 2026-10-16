import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from './Header.jsx'
import Footer from './Footer.jsx'

export default function RootLayout() {
  const { t } = useTranslation()
  return (
    <div className="min-h-svh flex flex-col bg-crema">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-verde-bosque focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        {t('skipToContent')}
      </a>
      <Header />
      <main id="contenido" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}