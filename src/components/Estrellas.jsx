// Star rating building blocks used across the app: a read-only display
// (Estrellas) and an interactive 0..5 picker (SelectorEstrellas). The palette
// class `text-amber` fills the glyphs; empty stars fall back to neutral-300.
// Accessibility names resolve from the `common` namespace (localized-ui-content).
import { useTranslation } from 'react-i18next'

function Glifo({ lleno, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={lleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

/** Read-only 5-star glyph row for an average (rounded to the nearest star). */
export function Estrellas({ valor = 0, className = 'h-4 w-4' }) {
  const { t } = useTranslation('common')
  const redondeado = Math.round(valor)
  return (
    <span className="inline-flex items-center gap-0.5 text-amber" role="img" aria-label={t('stars.ariaLabel', { valor })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Glifo key={i} lleno={i <= redondeado} className={className} />
      ))}
    </span>
  )
}

/**
 * Interactive 0..5 star picker. Clicking a star selects it; clicking the
 * currently selected star clears back to 0 (the review scale is 0..5).
 */
export function SelectorEstrellas({ valor = 0, onChange }) {
  const { t } = useTranslation('common')
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={t('stars.pickerAria')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={valor === i}
          aria-label={t('stars.star', { count: i })}
          onClick={() => onChange(valor === i ? 0 : i)}
          className="cursor-pointer transition-transform hover:scale-110"
        >
          <Glifo
            lleno={i <= valor}
            className={`h-8 w-8 ${i <= valor ? 'text-amber' : 'text-neutral-300'}`}
          />
        </button>
      ))}
    </div>
  )
}
