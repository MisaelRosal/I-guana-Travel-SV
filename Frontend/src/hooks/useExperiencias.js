import { useCallback, useEffect, useState } from 'react'
import { getExperiencias } from '../services/experiencias.js'

export function useExperiencias(filtros = {}) {
  const [experiencias, setExperiencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const datos = await getExperiencias(filtros)
      setExperiencias(datos)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [JSON.stringify(filtros)])

  useEffect(() => {
    cargar()
  }, [cargar])

  return { experiencias, cargando, error, recargar: cargar }
}
