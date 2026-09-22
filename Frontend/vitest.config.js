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
  },
})
