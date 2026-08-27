import { Link } from 'react-router-dom'

const formatoPrecio = new Intl.NumberFormat('es-SV', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export default function ExperienceCard({ experiencia }) {
  const esHospedaje = experiencia.tipo === 'hospedaje'
  const unidad = esHospedaje ? 'noche' : 'persona'
  const detalle = esHospedaje
    ? `${experiencia.habitaciones ?? 1} hab · ${experiencia.capacidad} huéspedes`
    : `${experiencia.duracionHoras ?? 0} h · ${experiencia.capacidad} cupos`

  return (
    <Link
      to={`/experiencias/${experiencia.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm hover:shadow-lg transition-shadow"
    >
      <div className="relative h-52 overflow-hidden">
        <img
          src={experiencia.imagenes[0]}
          alt={experiencia.titulo}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 rounded-full bg-verde-bosque/90 px-3 py-1 text-xs font-semibold text-white">
          {experiencia.categoria}
        </span>
        {experiencia.popular && (
          <span className="absolute top-3 right-3 rounded-full bg-terracota px-3 py-1 text-xs font-semibold text-white">
            Popular
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg font-bold text-verde-bosque line-clamp-1">{experiencia.titulo}</h3>
        <p className="mt-1 text-sm text-cafe">
          {experiencia.municipio}, {experiencia.departamento}
        </p>
        <p className="mt-2 text-sm text-neutral-600 line-clamp-2 flex-1">{experiencia.descripcion}</p>
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-neutral-100 pt-3">
          <div className="min-w-0">
            <span className="text-xl font-extrabold text-terracota">{formatoPrecio.format(experiencia.precio)}</span>
            <span className="text-xs text-cafe"> / {unidad}</span>
          </div>
          <span className="text-xs text-cafe whitespace-nowrap">{detalle}</span>
        </div>
      </div>
    </Link>
  )
}