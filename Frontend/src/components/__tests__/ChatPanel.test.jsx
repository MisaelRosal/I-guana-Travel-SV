import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/config.js'

vi.mock('../../services/chat.js', () => ({
  abrirConversacion: vi.fn(),
  enviarMensaje: vi.fn(),
  getMensajes: vi.fn(),
  marcarLeido: vi.fn(),
}))

import {
  abrirConversacion,
  enviarMensaje,
  getMensajes,
  marcarLeido,
} from '../../services/chat.js'
import ChatPanel from '../ChatPanel.jsx'

const makeMessage = (id, overrides = {}) => ({
  id,
  emisor_usuario_id: 11,
  mensaje: `Message ${id}`,
  creado_en: `2026-01-01T00:${String(id).padStart(2, '0')}:00`,
  emisor_nombre: 'Host',
  publicacion: null,
  ...overrides,
})

function renderPanel(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ChatPanel abierto anfitrionId={7} publicacionId={314} onCerrar={vi.fn()} {...props} />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.setItem('iguana_usuario', JSON.stringify({ id: 10 }))
  abrirConversacion.mockResolvedValue({ id: 22 })
  getMensajes.mockResolvedValue({ mensajes: [], cursor: null })
  enviarMensaje.mockResolvedValue(makeMessage(51, {
    emisor_usuario_id: 10,
    mensaje: 'Sent from the listing',
  }))
  marcarLeido.mockResolvedValue({})
})

afterEach(async () => {
  cleanup()
  sessionStorage.clear()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('ChatPanel thread behavior', () => {
  it('opens the pair, loads history, marks foreign messages read and renders publication context', async () => {
    getMensajes.mockResolvedValueOnce({
      mensajes: [makeMessage(4, {
        mensaje: 'Coffee farm details',
        publicacion: { id: 314, titulo: 'Coffee route', precio: 25 },
      })],
      cursor: null,
    })

    renderPanel()

    expect(await screen.findByText('Coffee farm details')).toBeInTheDocument()
    expect(abrirConversacion).toHaveBeenCalledWith(7)
    expect(getMensajes).toHaveBeenCalledWith(22, null, 'es')
    await waitFor(() => expect(marcarLeido).toHaveBeenCalledWith(22))
    expect(screen.getByText('Coffee route')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver publicación' })).toHaveAttribute('href', '/experiencias/314')
  })

  it('appends older keyset rows and sends the publication id rather than a route id', async () => {
    const newest = Array.from({ length: 50 }, (_, index) => makeMessage(50 - index))
    getMensajes.mockResolvedValueOnce({ mensajes: newest, cursor: { before_id: 1 } })
    getMensajes.mockResolvedValueOnce({ mensajes: [makeMessage(0)], cursor: null })

    renderPanel()

    expect(await screen.findByText('Message 50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver mensajes más antiguos' }))
    expect(await screen.findByText('Message 0')).toBeInTheDocument()
    expect(getMensajes).toHaveBeenNthCalledWith(
      2,
      22,
      { before_creado_en: '2026-01-01T00:01:00', before_id: 1 },
      'es',
    )

    const textarea = screen.getByRole('textbox', { name: 'Escribí tu mensaje…' })
    fireEvent.change(textarea, { target: { value: 'Sent from the listing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(enviarMensaje).toHaveBeenCalledWith(22, 'Sent from the listing', 314, 'es'))
  })

  it('enforces the 500-character counter and keeps keyboard dismissal accessible', async () => {
    const onCerrar = vi.fn()
    renderPanel({ onCerrar })

    const dialog = await screen.findByRole('dialog', { name: 'Mensaje al anfitrión' })
    const textarea = within(dialog).getByRole('textbox', { name: 'Escribí tu mensaje…' })
    fireEvent.change(textarea, { target: { value: 'x'.repeat(501) } })
    expect(within(dialog).getByText('501/500', { exact: false })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Enviar' })).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'ok' } })
    const send = within(dialog).getByRole('button', { name: 'Enviar' })
    send.focus()
    fireEvent.keyDown(send, { key: 'Tab' })
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onCerrar).toHaveBeenCalledOnce()
  })
})
