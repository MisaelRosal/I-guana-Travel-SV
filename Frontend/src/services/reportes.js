import { api } from './api.js'

export async function crearReporte({ reservaId, tipo, descripcion }) {
  return await api.post('/Reporte', { reservaId, tipo, descripcion })
}

export async function subirEvidenciaReporte(reporteId, file) {
  const formData = new FormData()
  formData.append('file', file)
  const token = document.cookie.split('; ').find(row => row.startsWith('XSRF-TOKEN='))?.split('=')[1]
  const res = await fetch(`/api/Reporte/${reporteId}/evidencias`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {},
  })
  if (!res.ok) {
    let msg = 'No se pudo subir la evidencia'
    try { const j = await res.json(); msg = j.mensaje || msg } catch {}
    throw new Error(msg)
  }
  return await res.json()
}

export async function getMisReportes() {
  return await api.get('/Reporte/mis')
}

export async function getTodosReportes() {
  return await api.get('/Reporte')
}

export async function cambiarEstadoReporte(id, { estado, notasAdmin }) {
  return await api.put(`/Reporte/${id}/estado`, { estado, notasAdmin })
}
