import { Link, useParams } from 'react-router-dom'

export default function ExperienceDetailPage() {
  const { id } = useParams()
  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <Link to="/" className="text-azul hover:text-azul-cielo font-medium block mb-4">
        ← Volver al catálogo
      </Link>
      <Link
        to="/"
        className="inline-block px-4 py-2 rounded-md bg-terracota text-white font-semibold hover:bg-verde-bosque transition-colors"
      >
        Reservar ahora
      </Link>
      <h1 className="text-3xl font-bold text-verde-bosque">Ficha de la experiencia #{id}</h1>
      <p className="mt-4 text-cafe">Aquí irá la galería, descripción, precio, cupos y el mapa (Leaflet).</p>
    </main>
  )
}