import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import LocationPicker from '../LocationPicker.jsx'

// F2b-2 (i18n-es-en) task 4.3 RED — the location picker's frontend-owned
// search chrome comes from the `experiencia` namespace (`location` block).
// react-leaflet is mocked: the jsdom map boundary stays out of test scope
// (F2b-1 precedent). Coordinates and OSM attribution are technical passthrough
// values that stay identical in both locales; only the words resolve keys.
// The ES block is the extraction approval test (byte-comparable Spanish).

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
  useMap: () => null,
}))

function renderPicker() {
  // lat/long present AND departamento/municipio already chosen: the
  // auto-geocode effect early-returns, so no network call is triggered.
  return render(
    <I18nextProvider i18n={i18n}>
      <LocationPicker
        departamentos={[{ id: 1, nombre: 'La Libertad' }]}
        municipios={[{ id: 2, nombre: 'San Diego', departamentoId: 1 }]}
        latitud="13.700000"
        longitud="-89.200000"
        departamentoId="1"
        municipioId="2"
        onLocationChange={() => {}}
        onDepartamentoChange={() => {}}
        onMunicipioChange={() => {}}
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

describe('EN active: picker search chrome comes from the experiencia namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the localized placeholder and search button', () => {
    renderPicker()

    expect(screen.getByPlaceholderText('Search location…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    // Technical coordinate labels keep their locale-neutral abbreviations.
    expect(screen.getByText((_, el) => el?.textContent === 'Lat: 13.7 | Lng: -89.2')).toBeInTheDocument()
    expect(screen.queryByText(/experiencia:/)).toBeNull()
  })
})

describe('ES active: extraction keeps the canonical Spanish picker byte-comparable', () => {
  it('renders the original Spanish literals after moving them into resources', () => {
    renderPicker()

    expect(screen.getByPlaceholderText('Buscar ubicación...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.textContent === 'Lat: 13.7 | Lng: -89.2')).toBeInTheDocument()
  })
})
