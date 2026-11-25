import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../i18n/config.js'

const marcadores = vi.hoisted(() => [])

vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn((options) => ({ options })),
  },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position, icon, children }) => {
    marcadores.push({ position, icon })
    return <div>{children}</div>
  },
  Popup: ({ children }) => <div>{children}</div>,
}))

import MapaPublicaciones, {
  experienciaIcon,
  hospedajeIcon,
  puntosDePublicacion,
} from '../MapaPublicaciones.jsx'

const hospedaje = {
  id: 1,
  tipo: 'hospedaje',
  titulo: 'Cabaña El Tronador',
  latitud: '13.7',
  longitud: '-89.2',
  imagenes: [],
}

const experienciaDestino = {
  id: 2,
  tipo: 'experiencia',
  titulo: 'Ruta del café',
  latitud: '13.5',
  longitud: '-89.3',
  destinoLatitud: '14.02',
  destinoLongitud: '-90.1',
  puntoEncuentroLatitud: '13.49',
  puntoEncuentroLongitud: '-89.38',
  imagenes: ['https://cdn.local/ruta.jpg'],
}

const experienciaEncuentro = {
  id: 3,
  tipo: 'experiencia',
  titulo: 'Tour de aves',
  latitud: '13.2',
  longitud: '-88.9',
  destinoLatitud: null,
  destinoLongitud: null,
  puntoEncuentroLatitud: '13.3',
  puntoEncuentroLongitud: '-89.1',
  imagenes: [],
}

const experienciaPropia = {
  id: 4,
  tipo: 'experiencia',
  titulo: 'Surf en El Tunco',
  latitud: '13.49',
  longitud: '-89.38',
  destinoLatitud: null,
  destinoLongitud: null,
  puntoEncuentroLatitud: null,
  puntoEncuentroLongitud: null,
  imagenes: [],
}

function renderMapa(publicaciones) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <MapaPublicaciones publicaciones={publicaciones} />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

beforeEach(() => {
  marcadores.length = 0
})

afterEach(async () => {
  cleanup()
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

describe('MapaPublicaciones: puntos', () => {
  it('ubica hospedaje en su latitud/longitud', () => {
    expect(puntosDePublicacion([hospedaje])[0].posicion).toEqual([13.7, -89.2])
  })

  it('prioriza destino sobre punto de encuentro y ubicación propia', () => {
    expect(puntosDePublicacion([experienciaDestino])[0].posicion).toEqual([14.02, -90.1])
  })

  it('usa punto de encuentro si no hay destino', () => {
    expect(puntosDePublicacion([experienciaEncuentro])[0].posicion).toEqual([13.3, -89.1])
  })

  it('usa la ubicación propia si experiencia no tiene destino ni encuentro', () => {
    expect(puntosDePublicacion([experienciaPropia])[0].posicion).toEqual([13.49, -89.38])
  })

  it('omite coordenadas inválidas y no renderiza el mapa sin puntos', () => {
    const invalida = { ...hospedaje, id: 5, latitud: '99', longitud: '-89.2' }
    const sinCoords = { ...hospedaje, id: 6, latitud: null, longitud: null }

    expect(puntosDePublicacion([invalida, sinCoords])).toEqual([])
    renderMapa([invalida, sinCoords])
    expect(screen.queryByTestId('map')).toBeNull()
  })
})

describe('MapaPublicaciones: popup y filtros', () => {
  it('renderiza una card-link al detalle de la publicación', () => {
    renderMapa([hospedaje])

    const link = screen.getByRole('link', { name: /Cabaña El Tronador/ })
    expect(link).toHaveAttribute('href', '/experiencias/1')
    expect(screen.getByText('Ver publicación')).toBeInTheDocument()
    expect(screen.getByAltText('Cabaña El Tronador')).toHaveAttribute('src', '/logo.png')
  })

  it('filtra por tipo con los iconos correctos', () => {
    renderMapa([hospedaje, experienciaDestino])

    expect(marcadores).toHaveLength(2)
    expect(marcadores[0].icon).toBe(hospedajeIcon)
    expect(marcadores[1].icon).toBe(experienciaIcon)

    marcadores.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Hospedaje' }))
    expect(marcadores).toHaveLength(1)
    expect(marcadores[0].icon).toBe(hospedajeIcon)

    marcadores.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Experiencias' }))
    expect(marcadores).toHaveLength(1)
    expect(marcadores[0].icon).toBe(experienciaIcon)

    marcadores.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    expect(marcadores).toHaveLength(2)
  })
})
