import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n/config.js'
import ExperienceCard from '../ExperienceCard.jsx'

// F2b-2 (i18n-es-en) task 4.3 RED — the shared experience card reads its
// frontend-owned unit and badge labels from the `experiencia` namespace
// (AD-3: `noche/persona` -> `card.perNight/perPerson`; the `cupos` plural
// contract lives in `reservas:cupos_one/_other` as a single source of truth,
// decided in F2b-1 and woken up here by its real consumer).
// Specs (openspec/changes/i18n-es-en/specs/localized-ui-content/spec.md):
//   * "Enum, unit, and badge labels localized": 'noche/persona' and 'cupos'
//     MUST resolve through resources; `cupos` via `_one/_other` + `count`.
//   * "User and DB content passthrough": stored title/categoria/municipio/
//     departamento/descripcion render verbatim in ANY locale.
//   * "Overlay subset": raw keys never surface.
// The ES block is the extraction approval test: Spanish is canonical, so the
// card MUST render byte-identical text after extraction (except the
// documented AD-3 correction "1 cupos" -> "1 cupo" this consumer enables).

const fixtures = vi.hoisted(() => ({
  hospedaje: {
    id: 10,
    titulo: 'Casa frente al mar en El Tunco',
    tipo: 'hospedaje',
    categoria: 'Playa',
    descripcion: 'Casa con vista al mar a pasos de la playa.',
    municipio: 'San Diego',
    departamento: 'La Libertad',
    precio: 120,
    capacidad: 4,
    habitaciones: 2,
    imagenes: [],
    proximaFecha: null,
    popular: false,
  },
  experiencia: {
    id: 11,
    titulo: 'Ruta del café en Apan',
    tipo: 'experiencia',
    categoria: 'Café',
    descripcion: 'Senderismo entre fincas cafetaleras.',
    municipio: 'Suchitoto',
    departamento: 'San Salvador',
    precio: 25,
    capacidad: 8,
    habitaciones: 0,
    imagenes: [],
    proximaFecha: null,
    popular: true,
  },
  oneSpot: {
    id: 12,
    titulo: 'Surf en El Sunzal',
    tipo: 'experiencia',
    categoria: 'Surf',
    descripcion: 'Clases de surf para principiantes.',
    municipio: 'La Libertad',
    departamento: 'La Libertad',
    precio: 30,
    capacidad: 1,
    habitaciones: 0,
    imagenes: [],
    proximaFecha: null,
    popular: false,
  },
  soloStay: {
    id: 13,
    titulo: 'Cabaña en Suchitoto',
    tipo: 'hospedaje',
    categoria: 'Cabaña',
    descripcion: 'Cabaña de una habitación para un huésped.',
    municipio: 'Suchitoto',
    departamento: 'San Salvador',
    precio: 60,
    capacidad: 1,
    habitaciones: 1,
    imagenes: [],
    proximaFecha: null,
    popular: false,
  },
}))

function renderCard(experiencia) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ExperienceCard experiencia={experiencia} proximaFecha={null} />
      </MemoryRouter>
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

describe('EN active: card unit and badge labels come from the experiencia namespace', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders the stay detail interpolation and the EN per-night unit', () => {
    renderCard(fixtures.hospedaje)

    // JD-INFO-4: the compound stay label splits into two count-driven
    // plural sub-keys (card.stayRooms/card.stayGuests `_one/_other`), joined
    // at the call site with the existing ` · ` separator, so both nouns agree
    // with their own count in every locale.
    expect(screen.getByText('2 rooms · 4 guests')).toBeInTheDocument()
    expect(screen.getByText('/ night')).toBeInTheDocument()

    // DB passthrough under English chrome.
    expect(screen.getByText('Casa frente al mar en El Tunco')).toBeInTheDocument()
    expect(screen.getByText('Playa')).toBeInTheDocument()
    expect(screen.getByText('San Diego, La Libertad')).toBeInTheDocument()

    // F5 (task 6.4): the card link emits the English-form detail URL under EN.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/experiences/10')

    // Partial-rollout guarantee: raw keys never surface.
    expect(screen.queryByText(/experiencia:/)).toBeNull()
    expect(screen.queryByText(/reservas:/)).toBeNull()
  })

  it('pluralizes both stay counts independently for the 1-room 1-guest stay (JD-INFO-4)', () => {
    // The compound stay label is two _one/_other sub-keys joined by ` · `, so
    // each count picks its own English plural form: "1 room"/"2 rooms",
    // "1 guest"/"4 guests".
    renderCard(fixtures.soloStay)

    expect(screen.getByText('1 room · 1 guest')).toBeInTheDocument()
    expect(screen.queryByText('1 room · 1 guests')).toBeNull()
    expect(screen.queryByText('1 rooms · 1 guest')).toBeNull()
  })

  it('renders the capacity badge through the reservas:cupos consumer contract', () => {
    renderCard(fixtures.experiencia)

    expect(screen.getByText('8 spots')).toBeInTheDocument()
    expect(screen.getByText('/ person')).toBeInTheDocument()
    expect(screen.getByText('Popular')).toBeInTheDocument()
  })

  it('corrects the legacy always-plural capacity badge for count 1 (AD-3)', () => {
    // The pre-extraction JSX could only ever print "1 cupos" (Spanish) or an
    // untranslated badge; the F2b-1 _one/_other contract becomes visible here.
    renderCard(fixtures.oneSpot)

    expect(screen.getByText('1 spot')).toBeInTheDocument()
    expect(screen.queryByText(/spots/)).toBeNull()
  })
})

describe('ES active: extraction keeps the canonical Spanish card byte-comparable', () => {
  it('renders the original Spanish unit and detail strings', () => {
    renderCard(fixtures.hospedaje)
    expect(screen.getByText('2 hab · 4 huéspedes')).toBeInTheDocument()
    expect(screen.getByText('/ noche')).toBeInTheDocument()
    // F5 approval: the ES form is byte-identical to today's literal.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/experiencias/10')

    cleanup()
    renderCard(fixtures.experiencia)
    expect(screen.getByText('8 cupos')).toBeInTheDocument()
    expect(screen.getByText('/ persona')).toBeInTheDocument()
    expect(screen.getByText('Popular')).toBeInTheDocument()
  })

  it('resolves the pluralized cupos contract in Spanish (1 cupo)', () => {
    renderCard(fixtures.oneSpot)
    expect(screen.getByText('1 cupo')).toBeInTheDocument()
    expect(screen.queryByText('1 cupos')).toBeNull()
  })

  it('keeps the canonical multi-item stay label byte-stable and fixes the singular ES pair (JD-INFO-4)', () => {
    // N>=2 / M>=2 stays byte-identical to the approved 'N hab · M huéspedes';
    // the singular pair must read "1 hab · 1 huésped", never "1 huéspedes".
    renderCard(fixtures.soloStay)
    expect(screen.getByText('1 hab · 1 huésped')).toBeInTheDocument()
    expect(screen.queryByText('1 hab · 1 huéspedes')).toBeNull()
  })
})
