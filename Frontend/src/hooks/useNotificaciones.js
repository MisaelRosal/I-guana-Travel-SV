import { useCallback, useEffect, useRef, useState } from 'react'
import { getMisNotificaciones, marcarNotificacionLeida, marcarTodasLeidas } from '../services/notificaciones.js'

// Header bell poll (skeleton mirrored from useChatNoLeidos): one 30 s
// GET /api/Notificacione/mias for the signed-in user, paused while the tab is
// hidden with an immediate tick on return, stopped when `autenticado` flips
// false. A failed background poll keeps the last loaded list; `error` only
// drives the panel's error state when nothing could ever be loaded. Mark-read
// actions refetch after the service call so the server stays the source of
// truth (simple, and the 30 s poll reconciles the badge anyway).
const INTERVALO_NOTIFICACIONES_MS = 30000

export function useNotificaciones(autenticado) {
  const [notificaciones, setNotificaciones] = useState([])
  const [sinLeer, setSinLeer] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  // Shared by the poll and the mark-read actions so a late response after
  // unmount never calls setState (same guard idea as useChatNoLeidos' `vivo`).
  const vivo = useRef(true)

  const cargar = useCallback(() => {
    return getMisNotificaciones()
      .then((datos) => {
        if (!vivo.current) return
        setNotificaciones(datos?.notificaciones ?? [])
        setSinLeer(datos?.sinLeer ?? 0)
        setCargando(false)
        setError(null)
      })
      .catch((e) => {
        if (!vivo.current) return
        setCargando(false)
        setError(e)
      })
  }, [])

  useEffect(() => {
    vivo.current = true
    if (!autenticado) {
      setNotificaciones([])
      setSinLeer(0)
      setCargando(false)
      setError(null)
      return () => { vivo.current = false }
    }
    setCargando(true)
    const tick = () => { cargar() }
    tick()
    const intervalo = setInterval(() => {
      if (!document.hidden) tick()
    }, INTERVALO_NOTIFICACIONES_MS)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo.current = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [autenticado, cargar])

  const marcarLeida = useCallback(async (id) => {
    await marcarNotificacionLeida(id)
    await cargar()
  }, [cargar])

  const marcarTodas = useCallback(async () => {
    await marcarTodasLeidas()
    await cargar()
  }, [cargar])

  return { notificaciones, sinLeer, cargando, error, marcarLeida, marcarTodas }
}
