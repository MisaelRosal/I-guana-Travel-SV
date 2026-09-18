import { api } from './api.js'

export async function getMunicipios() {
  return api.get('/Municipio')
}

export async function getAnfitriones() {
  return api.get('/Anfitrione')
}

export async function getAnfitrionPorId(id) {
  return api.get(`/Anfitrione/${id}`)
}

export async function actualizarPerfilAnfitrion(id, datos) {
  return api.put(`/Anfitrione/${id}/perfil`, datos)
}

// W3b: no `usuarioId` in the payload — the server binds the new host to the
// authenticated session subject (token `sub`), never to a client-supplied id.
export async function registrarAnfitrion({ municipioId, nombre, email, telefono, direccion, descripcion, fotoPerfil }) {
  return api.post('/Anfitrione/registrar', {
    municipioId: parseInt(municipioId),
    nombre,
    email,
    telefono,
    direccion,
    descripcion,
    fotoPerfil,
  })
}

export const obtenerSesion = () => {
  try {
    return JSON.parse(sessionStorage.getItem('iguana_usuario') || 'null')
  } catch {
    return null
  }
}

export const guardarSesion = (usuario) => {
  sessionStorage.setItem('iguana_usuario', JSON.stringify(usuario))
  window.dispatchEvent(new Event('auth-change'))
}

export const esAdmin = (rol) => rol === 'admin' || rol === 'administrador'