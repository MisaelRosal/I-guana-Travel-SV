import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import Toast from '../Toast.jsx'

// F1 (i18n-es-en): toast passthrough proof. Spec scenario
// "Backend error under English" (localized-ui-content): GIVEN EN is active WHEN
// an API error returns `mensaje: "No autorizado"` THEN the toast displays it
// verbatim — the message is backend-owned content and MUST NOT be translated.
// The toast's only frontend-owned string is the close button `aria-label`,
// which comes from the `common` namespace.

function renderToast(props) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Toast {...props} />
    </I18nextProvider>,
  )
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

describe('EN active: backend messages render verbatim (passthrough MUST)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows "No autorizado" untouched while the control chrome is English', () => {
    renderToast({ mensaje: 'No autorizado', tipo: 'error', onCerrar: vi.fn() })

    expect(screen.getByRole('status')).toHaveTextContent('No autorizado')
    // Frontend-owned string: served from the common namespace in EN.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('keeps a Spanish success mensaje verbatim too (triangulation)', () => {
    renderToast({ mensaje: 'Reserva creada', tipo: 'exito', onCerrar: vi.fn() })

    expect(screen.getByRole('status')).toHaveTextContent('Reserva creada')
    expect(screen.queryByText(/common:/)).toBeNull()
  })
})

describe('ES active: canonical Spanish chrome', () => {
  it('closes with the Spanish accessible name', () => {
    renderToast({ mensaje: 'No autorizado', tipo: 'error', onCerrar: vi.fn() })

    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No autorizado')
  })
})
