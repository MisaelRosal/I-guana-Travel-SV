import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'

vi.mock('../../services/soporte.js', () => ({
  crearSoporte: vi.fn(async () => ({ id: 1 })),
}))

import { crearSoporte } from '../../services/soporte.js'
import ModalSoporte from '../ModalSoporte.jsx'

function renderModal() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ModalSoporte usuario={null} onCerrar={() => {}} />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('ModalSoporte', () => {
  it('envía el formulario y muestra confirmación', async () => {
    renderModal()

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@correo.com' } })
    fireEvent.change(screen.getByLabelText('Asunto'), { target: { value: 'No puedo entrar' } })
    fireEvent.change(screen.getByLabelText('Descripción del problema'), {
      target: { value: 'Al iniciar sesión la página se queda cargando.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))

    await waitFor(() => expect(crearSoporte).toHaveBeenCalledWith({
      nombre: 'Ana Pérez',
      email: 'ana@correo.com',
      asunto: 'No puedo entrar',
      mensaje: 'Al iniciar sesión la página se queda cargando.',
    }))
    expect(await screen.findByText(/Recibimos tu reporte/)).toBeInTheDocument()
  })
})
