// WCAG 2.3.3: scripted scrolling must honor the user's reduced-motion setting.
// Returns the native ScrollBehavior so call sites stay a one-argument change.
export function scrollBehavior() {
  if (typeof window.matchMedia !== 'function') return 'smooth'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
