import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import Footer from '../Footer.jsx'

function renderFooter() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

function mockSession(rol) {
  sessionStorage.setItem('iguana_usuario', JSON.stringify({ id: 1, rol }))
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(async () => {
  cleanup()
  sessionStorage.clear()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('Footer host CTA', () => {
  it('muestra Ya eres anfitrión para un anfitrión', () => {
    mockSession('anfitrion')
    renderFooter()

    expect(screen.getByRole('status')).toHaveTextContent('Ya eres anfitrión')
    expect(screen.queryByRole('link', { name: 'Conviértete en anfitrión' })).toBeNull()
  })

  it('también muestra el mensaje para un admin', () => {
    mockSession('admin')
    renderFooter()

    expect(screen.getByRole('status')).toHaveTextContent('Ya eres anfitrión')
    expect(screen.queryByRole('link', { name: 'Conviértete en anfitrión' })).toBeNull()
  })

  it('mantiene el enlace para un usuario normal', () => {
    mockSession('usuario')
    renderFooter()

    expect(screen.getAllByRole('link', { name: 'Conviértete en anfitrión' })).toHaveLength(2)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
