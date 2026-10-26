import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localePath } from '../i18n/routes.jsx'
import {
  getIdsFavoritos,
  guardarPublicacion,
  quitarPublicacionGuardada,
} from '../services/favoritos.js'
import { guardarSesionCache, leerSesionCache } from '../services/session.js'

/**
 * Estado compartido de "publicación guardada" para catálogo, detalle y mi cuenta.
 *
 * - El set de ids viene del servidor (/Favorito/ids) acotado al usuario de la
 *   sesión: el caché de sessionStorage solo decide SI se pinta el botón activo,
 *   nunca qué está guardado.
 * - Sin sesión, `alternar` no llama al servidor: lleva a la pantalla de login
 *   (el servidor respondería 401 igual, pero sin un fallo molesto en consola).
 * - El cambio es optimista y se revierte si el servidor falla; `error` es un
 *   contador que las páginas usan para (re)mostrar su toast de aviso.
 * - Reacciona al evento `auth-change` (login/logout en esta pestaña) con el que
 *   ya trabajan Header y Footer, así el catálogo no queda congelado tras entrar.
 */
export default function useFavoritos() {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState(() => leerSesionCache())
  const [ids, setIds] = useState(() => new Set())
  const [error, setError] = useState(0)

  useEffect(() => {
    const refrescar = () => setUsuario(leerSesionCache())
    window.addEventListener('auth-change', refrescar)
    return () => window.removeEventListener('auth-change', refrescar)
  }, [])

  useEffect(() => {
    let activo = true
    if (!usuario) {
      setIds(new Set())
      return () => { activo = false }
    }
    getIdsFavoritos()
      .then((lista) => { if (activo) setIds(new Set(lista)) })
      // Sin ids no se pinta nada pulsado; el servidor sigue mandando en el toggle.
      .catch(() => { if (activo) setIds(new Set()) })
    return () => { activo = false }
  }, [usuario])

  const guardado = (publicacionId) => ids.has(publicacionId)

  const alternar = useCallback(async (publicacionId) => {
    const eraGuardado = ids.has(publicacionId)

    if (!usuario) {
      navigate(localePath('login'))
      return { ok: false, motivo: 'sesion' }
    }

    // Optimismo: la card cambia al instante; el servidor es quien confirma.
    setIds((prev) => {
      const siguiente = new Set(prev)
      if (eraGuardado) siguiente.delete(publicacionId)
      else siguiente.add(publicacionId)
      return siguiente
    })

    try {
      if (eraGuardado) await quitarPublicacionGuardada(publicacionId)
      else await guardarPublicacion(publicacionId)
      return { ok: true, guardado: !eraGuardado }
    } catch (e) {
      setIds((prev) => {
        const siguiente = new Set(prev)
        if (eraGuardado) siguiente.add(publicacionId)
        else siguiente.delete(publicacionId)
        return siguiente
      })

      if (e.status === 401) {
        // La cookie venció: el caché local mintió, se limpia y se pide login.
        guardarSesionCache(null)
        navigate(localePath('login'))
        return { ok: false, motivo: 'sesion' }
      }

      setError((n) => n + 1)
      return { ok: false, motivo: 'error' }
    }
  }, [ids, usuario, navigate])

  return { guardado, alternar, error }
}
