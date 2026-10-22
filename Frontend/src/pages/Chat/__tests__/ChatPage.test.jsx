import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../i18n/config.js'

vi.mock('../../../services/chat.js', () => ({
  getMias: vi.fn(),
  getMensajes: vi.fn(),
  marcarLeido: vi.fn(),
}))

import { getMias, getMensajes, marcarLeido } from '../../../services/chat.js'
import ChatPage from '../ChatPage.jsx'

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/mensajes']}>
        <ChatPage />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.setItem('iguana_usuario', JSON.stringify({ id: 10 }))
  getMias.mockResolvedValue([{
    conversacion_id: 22,
    contra_nombre: 'Ana Host',
    contra_foto: null,
    ultimo_mensaje_texto: 'Original Spanish preview',
    ultimo_mensaje_en: '2026-01-01T12:00:00',
    no_leidos: 2,
  }])
  getMensajes.mockResolvedValue({ mensajes: [], cursor: null })
  marcarLeido.mockResolvedValue({})
})

afterEach(async () => {
  sessionStorage.clear()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('ChatPage inbox', () => {
  it('shows the unified inbox row and opens the shared thread view', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Tus mensajes' })).toBeInTheDocument()
    expect(screen.getByText('Ana Host')).toBeInTheDocument()
    expect(screen.getByText('Original Spanish preview')).toBeInTheDocument()
    expect(screen.getByText('2 sin leer')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir conversación' }))

    expect(await screen.findByRole('heading', { name: 'Ana Host' })).toBeInTheDocument()
    expect(getMensajes).toHaveBeenCalledWith(22, null, 'es')
    expect(getMias).toHaveBeenCalledOnce()
  })

  it('provides a login link when there is no cached session', async () => {
    sessionStorage.clear()
    renderPage()

    expect(screen.getByRole('heading', { name: 'Iniciá sesión para ver tus mensajes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
    expect(getMias).not.toHaveBeenCalled()
  })
})
