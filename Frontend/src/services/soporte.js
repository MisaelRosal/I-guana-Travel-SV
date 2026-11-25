import { api } from './api.js'

export function crearSoporte(datos) {
  return api.post('/Soporte', datos)
}

export function getSoportesAdmin() {
  return api.get('/Soporte')
}

export function cambiarEstadoSoporte(id, datos) {
  return api.put(`/Soporte/${id}/estado`, datos)
}
