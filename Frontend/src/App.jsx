import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n/config.js'
import { ROUTE_PAIRS } from './i18n/routes.jsx'
import RootLayout from './layouts/RootLayout.jsx'
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
            {/* F5 (AD-1): each screen is registered under its Spanish path and
                its English alias pointing at the SAME element — alias-only,
                never a <Navigate>. Identical forms (login/panel/admin/root)
                are registered once. */}
            {ROUTE_PAIRS.flatMap((pair) => {
              const forms = pair.es === pair.en ? [pair.es] : [pair.es, pair.en]
              return forms.map((path) =>
                path === '/'
                  ? <Route key={pair.key} index element={pair.element} />
                  : <Route key={`${pair.key}:${path}`} path={path} element={pair.element} />,
              )
            })}
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nextProvider>
  )
}

export default App
