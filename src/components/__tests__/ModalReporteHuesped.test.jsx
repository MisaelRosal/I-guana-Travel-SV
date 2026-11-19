import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import ModalReporteHuesped from '../ModalReporteHuesped.jsx'
import { crearReporte, subirEvidenciaReporte } from '../../services/reportes.js'

// N2 (i18n guest-report modal): the modal reads every user-facing string from
// the `panel` namespace (`reports.*`). The backend CrearReporteValidator only
// accepts the tipo set {dano, perjuicio, otro}, so the option VALUES stay
// exactly those strings while the labels come from resources.

vi.mock('../../services/reportes.js', () => ({
  crearReporte: vi.fn(async () => ({ id: 1 })),
  subirEvidenciaReporte: vi.fn(async () => ({})),
}))

const RESERVA = { id: 7, nombreHuesped: 'Juan Pérez', experienciaTitulo: 'Tour de surf' }

function renderModal(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ModalReporteHuesped reserva={RESERVA} onCerrar={vi.fn()} onExito={vi.fn()} {...props} />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  crearReporte.mockClear()
  subirEvidenciaReporte.mockClear()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
  localStorage.clear()
})

describe('ES activo: el modal de reporte se renderiza localizado', () => {
  it('muestra las cadenas en español y nunca claves crudas', () => {
    renderModal()

    expect(screen.getByRole('heading', { name: 'Reportar huésped' })).toBeInTheDocument()
    expect(screen.getByText('Tipo')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Daño a la propiedad' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Perjuicio / incumplimiento' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Otro' })).toBeInTheDocument()
    expect(screen.getByText('Descripción')).toBeInTheDocument()
    expect(screen.getByText('Evidencias (fotos)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar reporte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    // No raw i18n keys surface anywhere in the dialog.
    expect(screen.queryByText(/^reports\./)).toBeNull()
  })

  it('envía el reporte con el valor de tipo exacto que acepta el backend', async () => {
    renderModal()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'perjuicio' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'No devolvió el equipo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))

    await waitFor(() =>
      expect(crearReporte).toHaveBeenCalledWith({
        reservaId: 7,
        tipo: 'perjuicio',
        descripcion: 'No devolvió el equipo',
      }),
    )
    expect(subirEvidenciaReporte).not.toHaveBeenCalled()
  })

  it('exige una descripción antes de enviar y muestra el error localizado', async () => {
    renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte' }))

    expect(await screen.findByText('Agregá una descripción del daño o perjuicio.')).toBeInTheDocument()
    expect(crearReporte).not.toHaveBeenCalled()
  })
})
