import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import esCommon from '../locales/es/common.json'
import esHeader from '../locales/es/header.json'
import esCatalog from '../locales/es/catalog.json'
import esFooter from '../locales/es/footer.json'
import esAuth from '../locales/es/auth.json'
import esPerfil from '../locales/es/perfil.json'
import esPublicacion from '../locales/es/publicacion.json'
import esReservas from '../locales/es/reservas.json'
import esPanel from '../locales/es/panel.json'
import esAdmin from '../locales/es/admin.json'
import enCommon from '../locales/en/common.json'
import enHeader from '../locales/en/header.json'
import enCatalog from '../locales/en/catalog.json'
import enFooter from '../locales/en/footer.json'
import enAuth from '../locales/en/auth.json'
import enPerfil from '../locales/en/perfil.json'
import enPublicacion from '../locales/en/publicacion.json'
import enReservas from '../locales/en/reservas.json'
import enPanel from '../locales/en/panel.json'
import enAdmin from '../locales/en/admin.json'

// F0 (i18n-es-en): single shared i18n runtime (AD-2, AD-5).
// Initialized once at module scope — module evaluation happens a single time
// per document, so React StrictMode double-mounting can never re-init or
// double-register the listeners below. `i18next-browser-languagedetector` is
// deliberately NOT used: navigator-based detection would pick EN on en-US
// browsers and break the first-visit-`es` MUST (AD-2).

export const LOCALE_STORAGE_KEY = 'iguana_locale'

// Active UI language -> BCP 47 formatting tag for Intl consumers (AD-4/F4).
export const FORMAT_LOCALES = { es: 'es-SV', en: 'en-US' }

const SUPPORTED_LOCALES = ['es', 'en']

// Manual storage read: `iguana_locale` must be exactly 'es' or 'en', anything
// else (or a private-mode throw) falls back to the canonical 'es'.
export function readStoredLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return SUPPORTED_LOCALES.includes(stored) ? stored : 'es'
  } catch {
    return 'es'
  }
}

const resources = {
  // ES is the canonical, complete set; EN is an overlay subset during rollout
  // (AD-3). A missing EN key falls back to Spanish, so raw keys never render.
  es: {
    common: esCommon,
    header: esHeader,
    catalog: esCatalog,
    footer: esFooter,
    auth: esAuth,
    perfil: esPerfil,
    publicacion: esPublicacion,
    reservas: esReservas,
    panel: esPanel,
    admin: esAdmin,
  },
  en: {
    common: enCommon,
    header: enHeader,
    catalog: enCatalog,
    footer: enFooter,
    auth: enAuth,
    perfil: enPerfil,
    publicacion: enPublicacion,
    reservas: enReservas,
    panel: enPanel,
    admin: enAdmin,
  },
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: readStoredLocale(),
    fallbackLng: 'es',
    defaultNS: 'common',
    ns: ['common', 'header', 'catalog', 'footer', 'auth', 'perfil', 'publicacion', 'reservas', 'panel', 'admin'],
    // Resources are static JSON, so store setup is fully synchronous. The
    // restored startup language may still emit one deferred `languageChanged`
    // that reaches the persistence listener below; it rewrites the value just
    // read from storage (idempotent). Real cost is zero writes of new values:
    // exactly one write per actual change, per AD-5.
    initImmediate: false,
    interpolation: { escapeValue: false }, // React already escapes values
  })

  // Single persistence point (AD-5): one write per `languageChanged` — the
  // toggle, the cross-tab listener below and any future caller all funnel
  // through this one listener instead of writing to storage themselves.
  i18n.on('languageChanged', (lng) => {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, lng)
    } catch {
      // Storage full/unavailable: the in-memory language still changed.
    }
  })

  // Cross-tab sync (AD-5). `storage` fires only in the other tabs and only on
  // a real change, so changeLanguage here cannot bounce back as a second
  // event — no loop. Scoped to our key: the existing sessionStorage auth
  // listeners (Header.jsx:32, Footer.jsx:40) keep reacting to their own keys.
  window.addEventListener('storage', (e) => {
    if (e.key === LOCALE_STORAGE_KEY && SUPPORTED_LOCALES.includes(e.newValue)) {
      i18n.changeLanguage(e.newValue)
    }
  })
}

export default i18n
