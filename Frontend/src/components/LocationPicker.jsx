import { useEffect, useRef, useCallback, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function MapEventsHandler({ onMarkerMove, disabled }) {
  useMapEvents({
    click(e) {
      if (!disabled) onMarkerMove(e.latlng)
    },
  })
  return null
}

function DraggableMarker({ position, onMove, disabled }) {
  const markerRef = useRef(null)

  const onDragEnd = useCallback(() => {
    const marker = markerRef.current
    if (marker) {
      const latlng = marker.getLatLng()
      onMove(latlng)
    }
  }, [onMove])

  if (!position) return null

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={markerIcon}
      draggable={!disabled}
      eventHandlers={{ dragend: onDragEnd }}
    />
  )
}

function SearchBar({ onSearch, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ', El Salvador')}&format=json&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      )
      const data = await res.json()
      setResults(data)
    } catch (err) {
      console.error('Error buscando:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
  }

  const selectResult = (item) => {
    const latlng = L.latLng(parseFloat(item.lat), parseFloat(item.lon))
    onSearch(latlng)
    setQuery(item.display_name.split(',').slice(0, 3).join(','))
    setResults([])
  }

  return (
    <div className="relative">
      <div className="flex">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setResults([]) }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar ubicación..."
          disabled={disabled}
          className="flex-1 rounded-l-lg border border-r-0 border-neutral-300 bg-white px-3 py-2 text-sm focus:border-verde-hoja focus:outline-none focus:ring-1 focus:ring-verde-hoja/40 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || disabled}
          className="cursor-pointer rounded-r-lg bg-verde-bosque px-3 py-2 text-sm font-semibold text-white hover:bg-verde-bosque/90 disabled:opacity-50"
        >
          {searching ? '...' : 'Buscar'}
        </button>
      </div>
      {results.length > 0 && (
        <ul className="absolute top-full left-0 z-[1000] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
          {results.map((item, i) => (
            <li
              key={i}
              onClick={() => selectResult(item)}
              className="cursor-pointer border-b border-neutral-100 px-3 py-2 text-sm text-neutral-700 last:border-0 hover:bg-verde-hoja/10"
            >
              {item.display_name.split(',').slice(0, 4).join(',')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function LocationPicker({
  departamentos,
  municipios,
  latitud,
  longitud,
  departamentoId,
  municipioId,
  onLocationChange,
  onDepartamentoChange,
  onMunicipioChange,
  disabled = false,
}) {
  const defaultPosition = [13.7, -89.2]
  const markerPosition = latitud && longitud ? [parseFloat(latitud), parseFloat(longitud)] : null

  const reverseGeocode = useCallback(async (latlng) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      )
      const data = await res.json()
      const addr = data.address || {}

      const state = addr.state || ''
      const city = addr.city || addr.town || addr.village || addr.municipality || ''

      const matchedDepto = departamentos.find((d) =>
        d.nombre.toLowerCase().includes(state.toLowerCase()) ||
        state.toLowerCase().includes(d.nombre.toLowerCase())
      )

      if (matchedDepto) {
        onDepartamentoChange(String(matchedDepto.id))

        setTimeout(() => {
          const matchedMunicipio = municipios.find(
            (m) =>
              m.departamentoId === matchedDepto.id &&
              (m.nombre.toLowerCase().includes(city.toLowerCase()) ||
                city.toLowerCase().includes(m.nombre.toLowerCase()))
          )
          if (matchedMunicipio) {
            onMunicipioChange(String(matchedMunicipio.id))
          }
        }, 150)
      }
    } catch (err) {
      console.error('Error en reverse geocoding:', err)
    }
  }, [departamentos, municipios, onDepartamentoChange, onMunicipioChange])

  const handleMarkerMove = useCallback(
    (latlng) => {
      if (disabled) return
      onLocationChange(String(latlng.lat.toFixed(6)), String(latlng.lng.toFixed(6)))
      reverseGeocode(latlng)
    },
    [onLocationChange, reverseGeocode, disabled]
  )

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200">
      <SearchBar onSearch={handleMarkerMove} disabled={disabled} />
      <MapContainer
        center={markerPosition || defaultPosition}
        zoom={markerPosition ? 14 : 9}
        style={{ height: '300px', width: '100%' }}
        scrollWheelZoom={!disabled}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEventsHandler onMarkerMove={handleMarkerMove} disabled={disabled} />
        <DraggableMarker position={markerPosition} onMove={handleMarkerMove} disabled={disabled} />
      </MapContainer>
      {markerPosition && (
        <div className="bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          Lat: {markerPosition[0]} | Lng: {markerPosition[1]}
        </div>
      )}
    </div>
  )
}
