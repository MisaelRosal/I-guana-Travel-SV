import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// F0 (i18n-es-en): unit contract for the i18n runtime configuration module.
// Specs (openspec/changes/i18n-es-en/specs/i18n-runtime/spec.md):
//   * a stored `iguana_locale` MUST be restored BEFORE first paint, so the
//     module-scope init must read localStorage at evaluation time;
//   * first visit with no entry (or a foreign value) MUST default to `es`;
//   * a fabricated nonexistent key returns the key string itself (documented
//     i18next behavior for missing keys — no crash, no resource lookup);
//   * the active UI language MUST map to BCP 47 tags via FORMAT_LOCALES
//     (es -> es-SV, en -> en-US).

const KEY = 'iguana_locale'

// Each fresh import re-evaluates config.js AND the i18next singleton it
// imports, against the localStorage state set by the test. The extra await
// flushes the instance's deferred init events so its startup persistence
// write lands inside THIS test (whose hooks clear storage afterwards) and
// never races into the next test's fresh module evaluation.
async function freshConfig() {
  vi.resetModules()
  const mod = await import('../config.js')
  // Macrotask boundary: flush this instance's deferred init microtasks (its
  // idempotent startup persistence write) into THIS test, whose hooks then
  // clear storage — instead of racing into the next test's fresh evaluation.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return mod
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('initial language selection (readStoredLocale + module-scope init)', () => {
  it('restores a stored "en" before first init', async () => {
    localStorage.setItem(KEY, 'en')
    const mod = await freshConfig()

    expect(mod.readStoredLocale()).toBe('en')
    expect(mod.default.language).toBe('en')
  })

  it('defaults to "es" when nothing is stored', async () => {
    const mod = await freshConfig()

    expect(mod.readStoredLocale()).toBe('es')
    expect(mod.default.language).toBe('es')
  })

  it('ignores a foreign stored value and still selects "es"', async () => {
    localStorage.setItem(KEY, 'fr')
    const mod = await freshConfig()

    expect(mod.readStoredLocale()).toBe('es')
    expect(mod.default.language).toBe('es')
  })
})

describe('EN overlay parity and missing-key contract', () => {
  it('renders English for keys present in the EN overlay', async () => {
    localStorage.setItem(KEY, 'en')
    const { default: i18n } = await freshConfig()

    expect(i18n.t('header:langToggle.switchToEn')).toBe('Switch to English')
  })

  // M-5 audit closed the last known EN gaps (panel.status.emptyBody,
  // auth.login.noAccount, reservas.gate.body), so the old "ES-only key" case
  // no longer exists. A fabricated key now pins i18next's documented
  // missing-key behavior: the key string itself is returned (i18next strips
  // the namespace prefix when formatting the missing value).
  it('returns the raw key string for a nonexistent key (documented i18next behavior)', async () => {
    localStorage.setItem(KEY, 'en')
    const { default: i18n } = await freshConfig()

    expect(i18n.t('panel:zzz.nonexistent.key')).toBe('zzz.nonexistent.key')
    expect(i18n.t('zzz:nonexistent.key')).toBe('nonexistent.key')
  })
})

describe('FORMAT_LOCALES (BCP 47 mapping for formatting consumers)', () => {
  it('maps es -> "es-SV" and en -> "en-US"', async () => {
    const { FORMAT_LOCALES } = await freshConfig()

    expect(FORMAT_LOCALES).toEqual({ es: 'es-SV', en: 'en-US' })
  })
})
