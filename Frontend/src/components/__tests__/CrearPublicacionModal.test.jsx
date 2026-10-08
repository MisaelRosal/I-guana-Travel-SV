import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import CrearPublicacionModal from '../CrearPublicacionModal.jsx'

// F2b-2 (i18n-es-en) task 4.3 RED — the create/edit publication modal reads
// its chrome from the `experiencia` namespace (`modal` block) and reuses the
// `common` dedup list already established in F2b-1 (actions.cancel,
// calendar.prevMonth/nextMonth, modal.close). Specs:
//   * "Localized text nodes": labels, legends, placeholders and dialog copy
//     resolve from EN resources when EN is active;
//   * "User and DB content passthrough": option lists (categorias, anfitriones,
//     amenidades, departamentos, municipios) render stored Spanish verbatim;
//   * "Overlay subset": raw keys never surface.
// DIAS/MESES/DIAS_CORTOS arrays and their month-name rendering are F4-owned
// and stay untouched here. react-leaflet is mocked (real LocationPicker renders
// through the mock — F2b-1 precedent). The ES block is the approval test.

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
  useMap: () => null,
}))

const apiData = vi.hoisted(() => ({
  categorias: [
    { id: 1, nombre: 'Playa', tipo: 'hospedaje' },
    { id: 2, nombre: 'Surf', tipo: 'experiencia' },
  ],
  anfitriones: [{ id: 1, nombre: 'Carlos Mendoza' }],
  amenidades: [{ id: 1, nombre: 'WiFi' }],
  departamentos: [{ id: 1, nombre: 'La Libertad' }],
  municipios: [{ id: 2, nombre: 'San Diego', departamentoId: 1 }],
}))

vi.mock('../../services/api.js', () => ({
  api: {
    get: vi.fn(async (path) => {
      if (path === '/Categoria') return apiData.categorias
      if (path === '/Anfitrione') return apiData.anfitriones
      if (path === '/Amenidade') return apiData.amenidades
      if (path === '/Departamento') return apiData.departamentos
      if (path === '/Municipio') return apiData.municipios
      return []
    }),
    post: vi.fn(async () => ({ id: 1 })),
    put: vi.fn(async () => ({ ok: true })),
  },
  readCsrfToken: vi.fn(() => 'token'),
}))

function renderModal(props = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <CrearPublicacionModal
        abierto
        onCerrar={() => {}}
        onCreada={() => {}}
        {...props}
      />
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

describe('EN active: modal chrome comes from the experiencia + common namespaces', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the stay form labels and placeholders from EN resources', async () => {
    renderModal()

    expect(await screen.findByRole('heading', { name: 'Create listing' })).toBeInTheDocument()
    expect(screen.getByText('What do you want to publish?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Stay' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Experience' })).toBeInTheDocument()
    expect(screen.getByText('Basic information')).toBeInTheDocument()
    expect(screen.getByText('Title *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('E.g.: Beachfront house in El Tunco')).toBeInTheDocument()
    expect(screen.getByText('Maximum capacity *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('People')).toBeInTheDocument()
    // DB-driven option values stay stored Spanish under English labels.
    expect(screen.getByRole('option', { name: 'Carlos Mendoza' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /WiFi/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create listing' })).toBeInTheDocument()
    // Close button now carries a localized accessible name.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByText(/experiencia:/)).toBeNull()
  })

  it('switches to the experience branch with calendar chrome through common keys', async () => {
    renderModal()
    await screen.findByRole('heading', { name: 'Create listing' })

    fireEvent.click(screen.getByRole('radio', { name: 'Experience' }))

    expect(screen.getByText('Available dates')).toBeInTheDocument()
    expect(
      screen.getByText('Pick in the calendar the days this experience can be booked.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
    expect(screen.getByText('Selected dates (0)')).toBeInTheDocument()
    expect(screen.getByText("You haven't picked any dates yet")).toBeInTheDocument()
    expect(screen.getByText('Start time')).toBeInTheDocument()
    expect(screen.getByText('End time')).toBeInTheDocument()
  })

  it('guards dirty exits through the localized confirmation layer', async () => {
    const onCerrar = vi.fn()
    renderModal({ onCerrar })
    await screen.findByRole('heading', { name: 'Create listing' })

    fireEvent.change(screen.getByPlaceholderText('E.g.: Beachfront house in El Tunco'), {
      target: { value: 'Casa con vista' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const confirm = await screen.findByText('Are you sure you want to leave?')
    expect(confirm).toBeInTheDocument()
    expect(screen.getByText('All form data will be discarded.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(screen.queryByText('Are you sure you want to leave?')).toBeNull()
    expect(onCerrar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await screen.findByText('Are you sure you want to leave?')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, leave' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('renders the edit-mode titles in EN', async () => {
    renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Casa frente al mar en El Tunco', descripcion: '', anfitrionId: 1,
        categoriaId: 1, precioPorNoche: 120, capacidadMaxima: 4, tipo: 'hospedaje',
        horarios: [], publicacionAmenidads: [],
      },
    })

    expect(await screen.findByRole('heading', { name: 'Edit listing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})

describe('ES active: extraction keeps the canonical Spanish modal byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', async () => {
    renderModal()

    expect(await screen.findByRole('heading', { name: 'Crear publicación' })).toBeInTheDocument()
    expect(screen.getByText('¿Qué quieres publicar?')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Hospedaje' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Experiencia' })).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
    expect(screen.getByText('Título *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ej: Casa frente al mar en El Tunco')).toBeInTheDocument()
    expect(screen.getByText('Descripción')).toBeInTheDocument()
    expect(screen.getByText('Anfitrión *')).toBeInTheDocument()
    expect(screen.getByText('Categoría *')).toBeInTheDocument()
    expect(screen.getByText('Precio por noche (USD) *')).toBeInTheDocument()
    expect(screen.getByText('Capacidad máxima *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Personas')).toBeInTheDocument()
    expect(screen.getByText('Ubicación')).toBeInTheDocument()
    expect(screen.getByText('Departamento *')).toBeInTheDocument()
    expect(screen.getByText('Municipio *')).toBeInTheDocument()
    expect(screen.getByText('Detalles del alojamiento')).toBeInTheDocument()
    expect(screen.getByText('Amenidades')).toBeInTheDocument()
    expect(screen.getByText('Imágenes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear publicación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('renders the original Spanish experience branch and edit titles', async () => {
    renderModal()
    await screen.findByRole('heading', { name: 'Crear publicación' })

    fireEvent.click(screen.getByRole('radio', { name: 'Experiencia' }))
    expect(screen.getByText('Fechas disponibles')).toBeInTheDocument()
    expect(
      screen.getByText('Elige en el calendario los días en que se puede reservar esta experiencia.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
    expect(screen.getByText('Fechas elegidas (0)')).toBeInTheDocument()
    expect(screen.getByText('Todavía no elegiste ninguna fecha')).toBeInTheDocument()

    cleanup()
    renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Casa', descripcion: '', anfitrionId: 1, categoriaId: 1,
        precioPorNoche: 120, capacidadMaxima: 4, tipo: 'hospedaje',
        horarios: [], publicacionAmenidads: [],
      },
    })
    expect(await screen.findByRole('heading', { name: 'Editar publicación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('keeps municipality fallback and DB option values in stored Spanish', async () => {
    renderModal()
    await screen.findByRole('heading', { name: 'Crear publicación' })

    // The labels are sibling <label>s (no htmlFor), so anchor on the option.
    const fallback = screen.getByText('Primero elegí un departamento')
    expect(fallback.closest('select')).not.toBeNull()
    // The neutral "pick" option repeats across the three unfiltered selects.
    expect(screen.getAllByText('Seleccionar...')).toHaveLength(3)
  })
})
