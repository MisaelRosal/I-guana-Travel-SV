import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import CrearPublicacionModal from '../CrearPublicacionModal.jsx'
import { api } from '../../services/api.js'

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
    delete: vi.fn(async () => ({ ok: true })),
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
    expect(screen.getByText('Start time *')).toBeInTheDocument()
    expect(screen.getByText('End time *')).toBeInTheDocument()
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
    expect(screen.getByText('Descripción *')).toBeInTheDocument()
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

  it('removes an existing image and re-normalizes the surviving one', async () => {
    api.delete.mockClear()
    api.put.mockClear()

    const { container } = renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Casa', descripcion: 'Cerca de la playa', anfitrionId: 1, categoriaId: 1,
        precioPorNoche: 120, capacidadMaxima: 4, tipo: 'hospedaje',
        habitaciones: 2, camas: 3, banos: 1, horaEntrada: '14:00', horaSalida: '11:00',
        latitud: 13.5, longitud: -89.3,
        municipio: { id: 2, departamentoId: 1 },
        horarios: [], publicacionAmenidads: [],
        imagenesPublicacions: [
          { id: 10, url: 'https://cdn.local/1.jpg', esPrincipal: true, orden: 0 },
          { id: 11, url: 'https://cdn.local/2.jpg', esPrincipal: false, orden: 1 },
        ],
      },
    })

    await screen.findByRole('heading', { name: 'Editar publicación' })
    expect(container.querySelectorAll('img')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar imagen' })[0])
    expect(container.querySelectorAll('img')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/ImagenesPublicacion/10'))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/ImagenesPublicacion/11', expect.objectContaining({
        publicacionId: 5,
        url: 'https://cdn.local/2.jpg',
        esPrincipal: true,
        orden: 0,
      })),
    )
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

// Optional tour waypoints (punto de encuentro / destino): the picker's hidden
// numeric inputs mirror the existing lat/long channel, so map-picks are
// simulated by driving those inputs. POST/PUT MUST carry the four camelCase
// API fields (puntoEncuentroLatitud/Longitud, destinoLatitud/Longitud),
// sending explicit nulls when a pair is unset or cleared.
// Mandatory-field helper: fills every required field; `sin` skips a field to
// exercise the new mandatory rules in the "Campos obligatorios" describe.
async function llenarHospedaje(container, { sin } = {}) {
    // The option lists load through async GETs — wait for them before
    // driving the selects, otherwise the change lands on empty <option>s.
    await screen.findByText('Carlos Mendoza')
    await screen.findByText('Playa')
    const selects = container.querySelectorAll('select')
    fireEvent.change(selects[0], { target: { value: '1' } }) // anfitrión
    fireEvent.change(selects[1], { target: { value: '1' } }) // categoría
    fireEvent.change(selects[2], { target: { value: '1' } }) // departamento
    fireEvent.change(selects[3], { target: { value: '2' } }) // municipio
    fireEvent.change(screen.getByPlaceholderText('Ej: Casa frente al mar en El Tunco'), {
      target: { value: 'Casa con vista' },
    })
    if (!sin?.includes('descripcion')) {
      fireEvent.change(screen.getByPlaceholderText('Describe el alojamiento...'), {
        target: { value: 'Casa cómoda frente a la playa' },
      })
    }
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '120' } })
    fireEvent.change(screen.getByPlaceholderText('Personas'), { target: { value: '4' } })
    // Rooms/beds/baths share the "0" placeholder and render in that DOM order
    // (capacity uses the "Personas" placeholder, so it is not matched here).
    const numericos = container.querySelectorAll('input[type="number"][placeholder="0"]')
    const valores = { habitaciones: '2', camas: '3', banos: '1' }
    Object.entries(valores).forEach(([campo, valor], i) => {
      if (!sin?.includes(campo)) fireEvent.change(numericos[i], { target: { value: valor } })
    })
    const tiempos = container.querySelectorAll('input[type="time"]')
    fireEvent.change(tiempos[0], { target: { value: '14:00' } })
    fireEvent.change(tiempos[1], { target: { value: '11:00' } })
    // Hidden numeric inputs: [0,1] main lat/lng, [2,3] meeting point, [4,5] destination.
    const inputs = container.querySelectorAll('input[type="number"][step="any"]')
    expect(inputs).toHaveLength(6)
    fireEvent.change(inputs[0], { target: { value: '13.5' } })
    fireEvent.change(inputs[1], { target: { value: '-89.3' } })
    return inputs
  }

  // Images are mandatory now: attaches one fake file via the upload input so
  // submit-flavored tests satisfy the image requirement. The uploader fetches
  // /api/Imagenes/upload directly (bypassing the api helper), so stub that
  // call and back-restore the previous global.
  const subirImagen = (container) => {
    const input = container.querySelector('input[type="file"]')
    // Real bytes: jsdom's URL.createObjectURL reads the blob's internal buffer,
    // so an empty string body would crash the preview effect.
    const file = new (window.File || File)([new Uint8Array([1, 2, 3, 4])], 'foto.png', { type: 'image/png' })
    const prevFetch = window.fetch
    window.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/Imagenes/upload')) {
        return { ok: true, json: async () => ({ url: 'http://localhost:9000/rutasv/subida.png' }) }
      }
      return prevFetch ? prevFetch(url) : { ok: false, json: async () => ({}) }
    })
    fireEvent.change(input, { target: { files: [file] } })
  }

// Optional tour waypoints (punto de encuentro / destino): the picker's hidden
// numeric inputs mirror the existing lat/long channel, so map-picks are
// simulated by driving those inputs. POST/PUT MUST carry the four camelCase
// API fields (puntoEncuentroLatitud/Longitud, destinoLatitud/Longitud),
// sending explicit nulls when a pair is unset or cleared.
describe('Puntos opcionales: punto de encuentro y destino', () => {
  it('serializa ambos puntos en el POST cuando están elegidos', async () => {
    api.post.mockClear()
    const { container } = renderModal()

    await llenarHospedaje(container)
    subirImagen(container)
    const inputs = container.querySelectorAll('input[type="number"][step="any"]')
    fireEvent.change(inputs[2], { target: { value: '13.49' } })
    fireEvent.change(inputs[3], { target: { value: '-89.38' } })
    fireEvent.change(inputs[4], { target: { value: '14.02' } })
    fireEvent.change(inputs[5], { target: { value: '-90.1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear publicación' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/Publicacione', expect.objectContaining({
        latitud: 13.5,
        longitud: -89.3,
        puntoEncuentroLatitud: 13.49,
        puntoEncuentroLongitud: -89.38,
        destinoLatitud: 14.02,
        destinoLongitud: -90.1,
      })),
      { timeout: 3000 },
    )
  })

  it('cambiar de tipo con datos en el formulario pide confirmación y aceptar limpia todo el formulario', async () => {
    const { container } = renderModal()

    await llenarHospedaje(container)
    const inputs = () => container.querySelectorAll('input[type="number"][step="any"]')
    fireEvent.change(inputs()[0], { target: { value: '13.5' } })
    fireEvent.change(inputs()[1], { target: { value: '-89.3' } })

    // Switching to experience asks: the form sections differ per tipo.
    fireEvent.click(screen.getByRole('radio', { name: 'Experiencia' }))
    expect(await screen.findByText('¿Cambiar de tipo de publicación?')).toBeInTheDocument()
    expect(inputs()[0].value).toBe('13.5')

    // Cancel keeps tipo and all data intact.
    fireEvent.click(screen.getByRole('button', { name: 'No cambiar' }))
    expect(screen.queryByText('¿Cambiar de tipo de publicación?')).toBeNull()
    expect(inputs()[0].value).toBe('13.5')

    // Accept wipes the WHOLE form (title included) and switches.
    fireEvent.click(screen.getByRole('radio', { name: 'Experiencia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar y limpiar el formulario' }))
    expect(screen.queryByText('¿Cambiar de tipo de publicación?')).toBeNull()
    expect(inputs()[0].value).toBe('')
    expect(inputs()[1].value).toBe('')
    expect(screen.queryByDisplayValue('Casa con vista')).toBeNull()
    // The host belongs to the session: the wipe never clears it (otherwise
    // the serializer sends a non-number and the API 400s on Int32 binding).
    expect(screen.getByDisplayValue('Carlos Mendoza')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Experiencia' })).toBeChecked()
  })

  it('en edición prefiere los puntos guardados y el PUT envía nulls al limpiar', async () => {
    api.put.mockClear()
    const { container } = renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Tour de surf', descripcion: 'Clases para principiantes', anfitrionId: 1, categoriaId: 2,
        precioPorNoche: 25, capacidadMaxima: 8, tipo: 'experiencia',
        latitud: 13.5, longitud: -89.3,
        puntoEncuentroLatitud: '13.49', puntoEncuentroLongitud: '-89.38',
        destinoLatitud: '14.02', destinoLongitud: '-90.1',
        municipio: { id: 2, departamentoId: 1 },
        horarios: [{ fecha: '2099-01-05', horaInicio: '10:00', horaFin: '12:00' }],
        publicacionAmenidads: [],
      },
    })
    await screen.findByRole('heading', { name: 'Editar publicación' })

    subirImagen(container)

    // The mandatory meeting point chip is preselected by default.
    expect(screen.getByRole('button', { name: 'Punto de encuentro' })).toHaveAttribute('aria-pressed', 'true')

    // Prefill: both saved points render their coordinates in the picker rows.
    expect(screen.getByText('13.49, -89.38')).toBeInTheDocument()
    expect(screen.getByText('14.02, -90.1')).toBeInTheDocument()

    // The meeting point is MANDATORY for experiences, so the clearing case
    // exercises the optional DESTINO instead.
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar destino' }))
    expect(screen.queryByText('14.02, -90.1')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/Publicacione/5', expect.objectContaining({
        id: 5,
        latitud: 13.5,
        longitud: -89.3,
        puntoEncuentroLatitud: 13.49,
        puntoEncuentroLongitud: -89.38,
        destinoLatitud: null,
        destinoLongitud: null,
      })),
      { timeout: 3000 },
    )
  })

  it('experiencia sin punto de encuentro bloquea el submit y lo exige', async () => {
    api.put.mockClear()
    renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Tour de surf', descripcion: '', anfitrionId: 1, categoriaId: 2,
        precioPorNoche: 25, capacidadMaxima: 8, tipo: 'experiencia',
        latitud: 13.5, longitud: -89.3,
        puntoEncuentroLatitud: '13.49', puntoEncuentroLongitud: '-89.38',
        destinoLatitud: '14.02', destinoLongitud: '-90.1',
        municipio: { id: 2, departamentoId: 1 },
        horarios: [{ fecha: '2099-01-05', horaInicio: '10:00', horaFin: '12:00' }],
        publicacionAmenidads: [],
      },
    })
    await screen.findByRole('heading', { name: 'Editar publicación' })

    // Everything native-required passes; only the waypoint pair is missing so
    // the meeting-point CLIENT check is the rule under test.
    fireEvent.change(screen.getByPlaceholderText('Describe la experiencia...'), {
      target: { value: 'Clases para principiantes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar punto de encuentro' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar destino' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(screen.getByText('El punto de encuentro es obligatorio para experiencias.')).toBeInTheDocument(),
      { timeout: 3000 },
    )
    expect(api.put).not.toHaveBeenCalled()
  })
})

// All form fields are mandatory now (Destino stays optional by design).
// jsdom 30 runs native constraint validation and swallows submit clicks on
// invalid forms, so fireEvent.submit dispatches submit directly to reach the
// client mirror of the native `required` rules.
describe('Campos obligatorios: bloqueo del submit sin API call', () => {
  it('hospedaje sin descripción muestra el error y no llama a la API', async () => {
    api.post.mockClear()
    const { container } = renderModal()

    await llenarHospedaje(container, { sin: ['descripcion'] })
    fireEvent.submit(container.querySelector('form'))

    expect(screen.getByRole('alert')).toHaveTextContent('La descripción es obligatoria.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('hospedaje sin camas muestra el error y no llama a la API', async () => {
    api.post.mockClear()
    const { container } = renderModal()

    await llenarHospedaje(container, { sin: ['camas'] })
    fireEvent.submit(container.querySelector('form'))

    expect(screen.getByRole('alert')).toHaveTextContent('Indica al menos 1 cama.')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('experiencia sin descripción muestra el error y no llama a la API', async () => {
    api.put.mockClear()
    const { container } = renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Tour de surf', descripcion: '', anfitrionId: 1, categoriaId: 2,
        precioPorNoche: 25, capacidadMaxima: 8, tipo: 'experiencia',
        latitud: 13.5, longitud: -89.3,
        puntoEncuentroLatitud: '13.49', puntoEncuentroLongitud: '-89.38',
        destinoLatitud: '14.02', destinoLongitud: '-90.1',
        municipio: { id: 2, departamentoId: 1 },
        horarios: [{ fecha: '2099-01-05', horaInicio: '10:00', horaFin: '12:00' }],
        publicacionAmenidads: [],
      },
    })
    await screen.findByRole('heading', { name: 'Editar publicación' })

    fireEvent.submit(container.querySelector('form'))

    expect(screen.getByRole('alert')).toHaveTextContent('La descripción es obligatoria.')
    expect(api.put).not.toHaveBeenCalled()
  })
})

// N1 (silent image-upload failure): a failed /api/Imagenes/upload response
// must abort the flow with a visible error BEFORE the publication is created
// (create) or any existing image is deleted (edit).
describe('Fallo de subida de imágenes: aborta sin crear ni borrar', () => {
  const subirImagenFallando = (container) => {
    const input = container.querySelector('input[type="file"]')
    const file = new (window.File || File)([new Uint8Array([1, 2, 3, 4])], 'foto.png', { type: 'image/png' })
    const prevFetch = window.fetch
    window.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ mensaje: 'boom' }) }))
    fireEvent.change(input, { target: { files: [file] } })
    return () => { window.fetch = prevFetch }
  }

  it('creación con subida fallida muestra el error y no llama POST /Publicacione', async () => {
    api.post.mockClear()
    const { container } = renderModal()

    await llenarHospedaje(container)
    const restaurarFetch = subirImagenFallando(container)

    fireEvent.submit(container.querySelector('form'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron subir las imágenes. Intentá de nuevo.'),
      { timeout: 3000 },
    )
    expect(api.post).not.toHaveBeenCalled()
    restaurarFetch()
  })

  it('edición con imagen existente y subida fallida NO borra las imágenes existentes', async () => {
    api.delete.mockClear()
    api.put.mockClear()
    const { container } = renderModal({
      esEdicion: true,
      pubExistente: {
        id: 5, titulo: 'Casa', descripcion: 'Cerca de la playa', anfitrionId: 1, categoriaId: 1,
        precioPorNoche: 120, capacidadMaxima: 4, tipo: 'hospedaje',
        habitaciones: 2, camas: 3, banos: 1, horaEntrada: '14:00', horaSalida: '11:00',
        latitud: 13.5, longitud: -89.3,
        municipio: { id: 2, departamentoId: 1 },
        horarios: [], publicacionAmenidads: [],
        imagenesPublicacions: [
          { id: 10, url: 'https://cdn.local/1.jpg', esPrincipal: true, orden: 0 },
        ],
      },
    })
    await screen.findByRole('heading', { name: 'Editar publicación' })

    const restaurarFetch = subirImagenFallando(container)

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron subir las imágenes. Intentá de nuevo.'),
      { timeout: 3000 },
    )
    expect(api.delete).not.toHaveBeenCalled()
    restaurarFetch()
  })
})
