import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import GestorDisponibilidad from '../GestorDisponibilidad.jsx'

// A-21 (gestor de disponibilidad): the operator blocks dates and edits the
// per-date slots. The component lists only experiences that carry dated
// horarios and persists each row through PUT /Horario/{id}.

vi.mock('../../services/api.js', () => ({
  api: {
    put: vi.fn(async () => ({ ok: true })),
    post: vi.fn(async () => ({ reservasMovidas: 2 })),
  },
}))

import { api } from '../../services/api.js'

const publicaciones = [
  {
    id: 7,
    titulo: 'Ruta del café',
    tipo: 'experiencia',
    horarios: [
      { id: 101, publicacionId: 7, fecha: '2026-11-10', horaInicio: '08:00:00', horaFin: '12:00:00', disponible: true, cupos: 12 },
      { id: 102, publicacionId: 7, fecha: '2026-11-12', horaInicio: '08:00:00', horaFin: '12:00:00', disponible: false, cupos: null },
    ],
  },
  {
    id: 8,
    titulo: 'Cabaña sin fechas',
    tipo: 'hospedaje',
    horarios: [{ id: 201, publicacionId: 8, diaSemana: 0, horaInicio: '14:00:00', horaFin: '11:00:00', disponible: true }],
  },
]

function renderGestor(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <GestorDisponibilidad
        publicaciones={publicaciones}
        onActualizado={() => {}}
        onMensaje={() => {}}
        {...props}
      />
    </I18nextProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') {
    await i18n.changeLanguage('es')
  }
})

describe('Gestor de disponibilidad', () => {
  it('lists the dated horarios of the selected experience and marks blocked rows', async () => {
    renderGestor()

    expect(await screen.findByRole('option', { name: 'Ruta del café' })).toBeInTheDocument()
    // Only the experience with dated horarios is selectable.
    expect(screen.queryByRole('option', { name: 'Cabaña sin fechas' })).toBeNull()

    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText('Bloqueada')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('shows the empty state when no experience has dated horarios', async () => {
    renderGestor({ publicaciones: [publicaciones[1]] })

    expect(await screen.findByText('Sin experiencias con fechas')).toBeInTheDocument()
  })

  it('blocks/unblocks a date and persists the row through PUT /Horario/{id}', async () => {
    renderGestor()
    await screen.findByText('Disponible')

    // Second row starts blocked; unblock it and set slots.
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])

    const slots = screen.getAllByLabelText('Cupos')
    fireEvent.change(slots[1], { target: { value: '8' } })

    const saveButtons = screen.getAllByRole('button', { name: 'Guardar' })
    fireEvent.click(saveButtons[1])

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/Horario/102', expect.objectContaining({
        publicacionId: 7,
        fecha: '2026-11-12',
        disponible: true,
        cupos: 8,
      })),
    )
  })

  it('changes the date through POST /Horario/{id}/reprogramar after confirmation', async () => {
    const onActualizado = vi.fn()
    const onMensaje = vi.fn()
    renderGestor({ onActualizado, onMensaje })

    await screen.findByText('Disponible')

    // The reschedule button only shows once the date differs from the stored one.
    expect(screen.queryByRole('button', { name: 'Reprogramar fecha' })).toBeNull()

    const dateInputs = screen.getAllByLabelText('Nueva fecha')
    fireEvent.change(dateInputs[0], { target: { value: '2026-12-01' } })

    const reprogramar = await screen.findByRole('button', { name: 'Reprogramar fecha' })
    fireEvent.click(reprogramar)

    // The component opens its own confirmation modal; confirm inside it.
    const dialog = await screen.findByRole('dialog', { name: 'Reprogramar fecha' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reprogramar fecha' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/Horario/101/reprogramar', { nuevaFecha: '2026-12-01' }),
    )
    expect(onActualizado).toHaveBeenCalled()
    expect(onMensaje).toHaveBeenCalled()
  })

  it('does not reschedule when the confirmation is dismissed', async () => {
    renderGestor()

    await screen.findByText('Disponible')
    const dateInputs = screen.getAllByLabelText('Nueva fecha')
    fireEvent.change(dateInputs[0], { target: { value: '2026-12-01' } })

    fireEvent.click(screen.getByRole('button', { name: 'Reprogramar fecha' }))

    // Dismiss the confirmation modal instead of confirming.
    const dialog = await screen.findByRole('dialog', { name: 'Reprogramar fecha' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(api.post).not.toHaveBeenCalled()
  })
})
