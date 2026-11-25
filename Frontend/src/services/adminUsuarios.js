import { api } from './api.js'

export function getUsuariosAdmin(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return api.get(`/admin/usuarios${query}`)
}

export function cambiarBaneoUsuario(id, baneado) {
  return api.put(`/admin/usuarios/${id}/baneo`, { baneado })
}

export function eliminarUsuario(id) {
  return api.delete(`/admin/usuarios/${id}`)
}
