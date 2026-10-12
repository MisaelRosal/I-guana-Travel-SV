import { api } from './api.js'

// Host earnings dashboard: simulated revenue of the caller's publications
// (an admin sees every publication). `periodo` is 'dia' | 'semana' | 'mes'
// and selects a trailing window; `publicacionId` optionally narrows the whole
// response to a single listing.
export async function getGanancias({ periodo = 'mes', publicacionId } = {}) {
  const params = new URLSearchParams()
  params.set('periodo', periodo)
  if (publicacionId) params.set('publicacionId', String(publicacionId))
  return api.get(`/Dashboard/ganancias?${params.toString()}`)
}
