import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import Logo from '../Logo.jsx'
import LoadingIguana from '../LoadingIguana.jsx'

// F2b-2 (i18n-es-en) task 4.4 — the shared brand components sweep their
// frontend-owned literals into `common`:
//   * Logo's alt resolves through `common:brand.name` (same value in both
//     locales — the resource-driven requirement is about provenance, not
//     translation);
//   * LoadingIguana's DEFAULT message resolves through `common:loading.default`
//     (ES 'Cargando…' byte-comparable, EN 'Loading…');
//   * an explicit caller-provided message still renders verbatim (catalog
//     page passes its own `catalog:` ns string — never overridden).

function renderTree(ui) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('EN active: shared components read common resources', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('serves the loading default message from the EN overlay', () => {
    renderTree(<LoadingIguana />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
  })

  it('serves the brand alt from resources', () => {
    renderTree(<Logo />)
    expect(screen.getByAltText('I Guana Travel SV')).toBeInTheDocument()
  })

  it('keeps an explicit caller message verbatim', () => {
    renderTree(<LoadingIguana message="Cargando publicaciones…" />)
    expect(screen.getByText('Cargando publicaciones…')).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish components byte-comparable', () => {
  it('renders the original default loading message', () => {
    renderTree(<LoadingIguana />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  it('renders the brand alt and hides the component on an empty message', () => {
    renderTree(<Logo />)
    expect(screen.getByAltText('I Guana Travel SV')).toBeInTheDocument()

    cleanup()
    renderTree(<LoadingIguana message="" />)
    // Caller opted out of any text: no <p> copy, only the logo.
    expect(screen.getByRole('status').querySelector('p')).toBeNull()
  })
})
