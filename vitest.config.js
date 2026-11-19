import { defineConfig } from 'vitest/config'

// Vitest config lives in its own file so `vite.config.js` (app build) stays
// untouched. jsdom provides document.cookie / sessionStorage / window events,
// which is all the W3a service-layer unit tests need — no browser, no backend.
export default defineConfig({
  test: {
    environment: 'jsdom',
    // Only services/utils get unit-tested here; component tests (if added
    // later) should live next to the code under __tests__ directories.
    include: ['src/**/__tests__/**/*.test.{js,jsx}'],
    server: {
      deps: {
        // The F0 i18n config suite proves "stored locale is read at module
        // evaluation" by re-importing src/i18n/config.js with vi.resetModules().
        // Externally-loaded node_modules survive that reset, which would keep
        // the i18next singleton — and thus its one-time init — alive. Inlining
        // these two packages makes resetModules give a genuinely fresh i18next
        // instance per test.
        inline: ['i18next', 'react-i18next'],
      },
    },
  },
})
