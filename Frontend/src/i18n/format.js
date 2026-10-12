// F4 (i18n-es-en, design AD-4): locale-aware Intl formatting for every
// date/number surface. Call sites receive the BCP 47 tag from
// `useFormatLocale()` (config.js -> FORMAT_LOCALES); the tags are never
// hardcoded here. Instances are cached in a Map keyed `locale|kind`, which
// keeps the old module-constant performance without per-render construction.
//
// ICU gotchas verified on Node 24:
//   * es-SV {month:'long',year:'numeric'} formats as `enero de 2026`, while
//     the manual arrays this replaces rendered `Enero 2026` -> formatMonthYear
//     joins the formatToParts month+year values and capitalizes;
//   * Intl emits lowercase months/weekdays in es — the helpers capitalize the
//     first char because jsdom (and copy) assert text, not the CSS class;
//   * date-only ISO strings parsed with `new Date('YYYY-MM-DD')` land on UTC
//     midnight and shift one day back under America/* — toDate() parses the
//     components as local time instead;
//   * es-SV CLDR short month for September is `sept` (the old hand-built
//     arrays said `sep`). Intl is the authority — documented correction,
//     same lane as the accepted AD-3 `1 cupos` -> `1 cupo` fix.

const formatters = new Map()

const SPECS = {
  price: {
    number: true,
    options: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
  },
  dayMonthShort: { options: { day: 'numeric', month: 'short' } },
  dayMonthYear: { options: { day: 'numeric', month: 'short', year: 'numeric' } },
  dateDMY: { options: { day: '2-digit', month: '2-digit', year: 'numeric' } },
  monthYear: { options: { month: 'long', year: 'numeric' } },
  monthLong: { options: { month: 'long' } },
  weekdayShort: { options: { weekday: 'short' } },
  weekdayLong: { options: { weekday: 'long' } },
}

// Cached factory: one Intl instance per `locale|kind` pair, forever.
export function getFormatter(locale, kind) {
  const key = `${locale}|${kind}`
  let formatter = formatters.get(key)
  if (!formatter) {
    const spec = SPECS[kind]
    formatter = spec.number
      ? new Intl.NumberFormat(locale, spec.options)
      : new Intl.DateTimeFormat(locale, spec.options)
    formatters.set(key, formatter)
  }
  return formatter
}

function toDate(value) {
  if (value instanceof Date) return value
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  if (dateOnly) {
    // Local components: the logical day survives any UTC-minus timezone.
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  return new Date(value)
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Anchors for index-based weekday names: 2026-01-05 is a Monday and
// 2026-01-04 a Sunday, so +index days walks the week from each convention.
const MONDAY_ANCHOR = [2026, 0, 5]
const SUNDAY_ANCHOR = [2026, 0, 4]

// USD always (spec "USD fixed in both locales"); grouping is Intl's job.
export function formatPrice(value, locale) {
  return getFormatter(locale, 'price').format(value)
}

// Chip style kept byte-for-byte: es-SV -> `5 ene`, en-US -> `Jan 5`.
export function formatDayMonthShort(value, locale) {
  return getFormatter(locale, 'dayMonthShort').format(toDate(value))
}

// Card next-date badge: es-SV -> `5 ene 2026`, en-US -> `Jan 5, 2026`.
export function formatDayMonthYear(value, locale) {
  return getFormatter(locale, 'dayMonthYear').format(toDate(value))
}

// Date text: es-SV -> `05/01/2026` (== the old formatearFechaCorta), en-US -> `01/05/2026`.
export function formatDateDMY(value, locale) {
  return getFormatter(locale, 'dateDMY').format(toDate(value))
}

// Calendar header: `Enero 2026` / `January 2026` — formatToParts join skips
// the ` de ` literal ICU inserts between month and year in es-SV.
export function formatMonthYear(value, locale) {
  const parts = getFormatter(locale, 'monthYear').formatToParts(toDate(value))
  const month = parts.find((part) => part.type === 'month').value
  const year = parts.find((part) => part.type === 'year').value
  return capitalize(`${month} ${year}`)
}

// Month name alone, for {{month}} calendar sentences: `Enero` / `January`.
export function formatMonthLong(value, locale) {
  return capitalize(getFormatter(locale, 'monthLong').format(toDate(value)))
}

// Monday-first short row (the old DIAS_CORTOS): `Lun`..`Dom` / `Mon`..`Sun`.
export function weekdayShortMonFirst(dayIndex, locale) {
  const [year, month, day] = MONDAY_ANCHOR
  return capitalize(getFormatter(locale, 'weekdayShort').format(new Date(year, month, day + dayIndex)))
}

// JS getDay() convention (0 = Sunday), weekly schedule (the old DIAS):
// `Domingo`..`Sábado` / `Sunday`..`Saturday`.
export function weekdayLong(dayIndex, locale) {
  const [year, month, day] = SUNDAY_ANCHOR
  return capitalize(getFormatter(locale, 'weekdayLong').format(new Date(year, month, day + dayIndex)))
}
