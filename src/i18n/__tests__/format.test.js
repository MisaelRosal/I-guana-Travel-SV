import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n, { useFormatLocale } from '../config.js'
import {
  formatPrice,
  formatDayMonthShort,
  formatDayMonthYear,
  formatDateDMY,
  formatMonthYear,
  formatMonthLong,
  weekdayShortMonFirst,
  weekdayLong,
  getFormatter,
} from '../format.js'

// F4 (i18n-es-en) task 5.1 RED — formatting goldens per design AD-4.
// Specs (openspec/changes/i18n-es-en/specs/localized-formatting/spec.md):
//   * "Formatting follows active locale": es-SV for ES, en-US for EN, never a
//     hardcoded tag at call sites;
//   * "No Spanish visual regression": fixed-date equivalence against the
//     pre-change manual code (`5 ene` chip, `formatearFechaCorta`);
//   * "USD fixed in both locales": `$` + Intl default grouping, ES and EN;
//   * "Per-locale formatting tests": the dual-locale assertion scenario.
// Verified ICU traps (Node 24): es-SV {month:'long',year:'numeric'} renders
// `enero de 2026` (so formatMonthYear joins formatToParts) and Intl emits
// lowercase months/weekdays (so helpers capitalize — jsdom asserts text, not
// the CSS `capitalize` class). Date-only ISO strings MUST keep their logical
// day under UTC-minus timezones (the America/* TZ trap of UTC-midnight parse).

afterEach(() => {
  cleanup()
})

describe('formatDayMonthShort — detail/modal date chip (`5 ene`)', () => {
  it('renders the exact abbreviated chip the manual MESES_CORTOS array produced', () => {
    expect(formatDayMonthShort('2026-01-05', 'es-SV')).toBe('5 ene')
    // Date objects and date-only strings resolve to the same logical day.
    expect(formatDayMonthShort(new Date(2026, 0, 5), 'es-SV')).toBe('5 ene')
  })

  it('renders en-US month-short style under English', () => {
    expect(formatDayMonthShort('2026-01-05', 'en-US')).toBe('Jan 5')
  })

  it('uses the canonical es-SV abbreviation for September (documented correction)', () => {
    // The hand-built arrays said `sep`; es-SV CLDR short is `sept`. The Intl
    // output is the authority (AD-4 intent), mirroring the accepted AD-3
    // `1 cupos` -> `1 cupo` precedent. Only month of the 12 where the old
    // array diverged from CLDR.
    expect(formatDayMonthShort('2026-09-05', 'es-SV')).toBe('5 sept')
    expect(formatDayMonthShort('2026-09-05', 'en-US')).toBe('Sep 5')
  })
})

describe('formatDayMonthYear — ExperienceCard next-date badge', () => {
  it('keeps the year the pre-change es-SV DateTimeFormat included', () => {
    expect(formatDayMonthYear('2026-01-05', 'es-SV')).toBe('5 ene 2026')
  })

  it('switches to en-US ordering and punctuation under English', () => {
    expect(formatDayMonthYear('2026-01-05', 'en-US')).toBe('Jan 5, 2026')
  })
})

describe('formatDateDMY — form/reservations date text', () => {
  it('matches formatearFechaCorta exactly for es-SV', () => {
    expect(formatDateDMY('2026-01-05', 'es-SV')).toBe('05/01/2026')
    expect(formatDateDMY(new Date(2026, 0, 5), 'es-SV')).toBe('05/01/2026')
  })

  it('follows en-US month/day conventions instead of forcing es ordering', () => {
    expect(formatDateDMY('2026-01-05', 'en-US')).toBe('01/05/2026')
  })

  it('pins the logical day (no UTC-midnight off-by-one)', () => {
    // new Date('2099-01-15') is UTC midnight; under UTC-6 a naive getDate()
    // rendered the previous day. The helper parses date-only values locally.
    expect(formatDateDMY('2099-01-15', 'es-SV')).toBe('15/01/2099')
  })
})

describe('formatPrice — USD fixed in both locales', () => {
  it('renders $1,250 identically in es-SV and en-US (AD-4 golden)', () => {
    expect(formatPrice(1250, 'es-SV')).toBe('$1,250')
    expect(formatPrice(1250, 'en-US')).toBe('$1,250')
  })

  it('keeps USD and locale-driven grouping for large values', () => {
    // maximumFractionDigits 0 is the pre-change integer-USD policy; grouping
    // itself comes from Intl, identical under es-SV and en-US.
    expect(formatPrice(1234567, 'es-SV')).toBe('$1,234,567')
    expect(formatPrice(1234567, 'en-US')).toBe('$1,234,567')
  })
})

describe('formatMonthYear — calendar headers (capitalize + formatToParts join)', () => {
  it('renders `Enero 2026`, NOT the ICU pattern output `enero de 2026`', () => {
    expect(formatMonthYear('2026-01-05', 'es-SV')).toBe('Enero 2026')
    expect(formatMonthYear(new Date(2026, 10, 20), 'es-SV')).toBe('Noviembre 2026')
  })

  it('renders English month-year under en-US', () => {
    expect(formatMonthYear('2026-01-05', 'en-US')).toBe('January 2026')
  })
})

describe('formatMonthLong — interpolated {{month}} calendar sentences', () => {
  it('capitalizes the Intl lowercase month to match the nombreMeses array', () => {
    expect(formatMonthLong('2026-01-05', 'es-SV')).toBe('Enero')
    expect(formatMonthLong('2026-09-03', 'es-SV')).toBe('Septiembre')
  })

  it('renders English month names under en-US', () => {
    expect(formatMonthLong('2026-01-05', 'en-US')).toBe('January')
  })
})

describe('weekday helpers — calendar rows and weekly schedule', () => {
  it('produces the Monday-first short row the DIAS_CORTOS arrays hand-built', () => {
    const es = Array.from({ length: 7 }, (_, i) => weekdayShortMonFirst(i, 'es-SV'))
    expect(es).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
    const en = Array.from({ length: 7 }, (_, i) => weekdayShortMonFirst(i, 'en-US'))
    expect(en).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('produces the Sunday-indexed long names the DIAS arrays hand-built', () => {
    // diaSemana follows JS getDay(): 0 = Sunday, matching DIAS[diaSemana].
    const es = Array.from({ length: 7 }, (_, i) => weekdayLong(i, 'es-SV'))
    expect(es).toEqual(['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'])
    expect(weekdayLong(3, 'en-US')).toBe('Wednesday')
  })
})

describe('Map-cached Intl factories (AD-4)', () => {
  it('reuses one instance per locale|kind key', () => {
    expect(getFormatter('es-SV', 'price')).toBe(getFormatter('es-SV', 'price'))
    expect(getFormatter('en-US', 'price')).toBe(getFormatter('en-US', 'price'))
  })

  it('separates cache entries by locale and by kind', () => {
    expect(getFormatter('es-SV', 'price')).not.toBe(getFormatter('en-US', 'price'))
    expect(getFormatter('es-SV', 'price')).not.toBe(getFormatter('es-SV', 'dateDMY'))
  })
})

describe('useFormatLocale — threads the UI language into Intl tags', () => {
  afterEach(async () => {
    if (i18n.language !== 'es') {
      await i18n.changeLanguage('es')
    }
  })

  const wrapper = ({ children }) => createElement(I18nextProvider, { i18n }, children)

  it('maps the active language through FORMAT_LOCALES and re-renders on toggle', async () => {
    const { result } = renderHook(() => useFormatLocale(), { wrapper })
    expect(result.current).toBe('es-SV')

    await i18n.changeLanguage('en')
    await waitFor(() => {
      expect(result.current).toBe('en-US')
    })
  })
})
