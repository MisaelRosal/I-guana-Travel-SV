import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useFormatLocale } from '../i18n/config.js'
import { localePath } from '../i18n/routes.jsx'
import { formatDayMonthYear, formatPrice } from '../i18n/format.js'

// F4 (AD-4): Intl comes from format.js through the active-locale hook; the
// tags are never hardcoded here (es-SV stays `5 ene 2026`, EN switches to
// `Jan 5, 2026` and en-US grouping in place, without a reload).

export default function ExperienceCard({ experiencia, proximaFecha }) {
  const { t } = useTranslation('experiencia')
  const locale = useFormatLocale()
  const esHospedaje = experiencia.tipo === 'hospedaje'
  const unidad = esHospedaje ? t('card.perNight') : t('card.perPerson')
  // Capacity badge (spec "Enum, unit, and badge labels localized"): consumed
  // from the `reservas:cupos` plural contract F2b-1 established — single
  // source of truth for `{{count}} cupo(s)`, so no duplicate key lands here.
  const detalle = esHospedaje
    ? t('card.stayDetail', { rooms: experiencia.habitaciones ?? 1, guests: experiencia.capacidad })
    : t('reservas:cupos', { count: experiencia.capacidad })

  return (
    // F5 (task 6.4): the card link follows the active locale's detail form.
    <Link
      to={localePath('experienceDetail', { id: experiencia.id })}
      className="group flex flex-col overflow-hidden rounded-xl bg-white shadow-sm hover:shadow-lg transition-shadow"
    >
      <div className="relative h-52 overflow-hidden">
        <img
          src={(experiencia.imagenes && experiencia.imagenes[0]) || '/logo.png'}
          alt={experiencia.titulo}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 rounded-full bg-verde-bosque/90 px-3 py-1 text-xs font-semibold text-white">
          {experiencia.categoria}
        </span>
        {proximaFecha && (
          <span className="absolute top-3 right-3 rounded-full bg-terracota px-3 py-1 text-xs font-semibold text-white">
            {formatDayMonthYear(proximaFecha, locale)}
          </span>
        )}
        {!proximaFecha && experiencia.popular && (
          <span className="absolute top-3 right-3 rounded-full bg-terracota px-3 py-1 text-xs font-semibold text-white">
            {t('card.popular')}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg font-bold text-verde-bosque line-clamp-1">{experiencia.titulo}</h3>
        <p className="mt-1 text-base text-cafe">
          {experiencia.municipio}, {experiencia.departamento}
        </p>
        <p className="mt-2 text-base text-neutral-600 line-clamp-2 flex-1">{experiencia.descripcion}</p>
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-neutral-100 pt-3">
          <div className="min-w-0">
            <span className="text-3xl font-extrabold text-terracota">{formatPrice(experiencia.precio, locale)}</span>
            <span className="text-sm text-cafe"> / {unidad}</span>
          </div>
          <span className="text-sm text-cafe whitespace-nowrap">{detalle}</span>
        </div>
      </div>
    </Link>
  )
}