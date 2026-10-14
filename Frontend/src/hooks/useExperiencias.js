import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getExperiencias } from '../services/experiencias.js'

export function useExperiencias(filtros = {}) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language
  const [experiencias, setExperiencias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const datos = await getExperiencias({ ...filtros, locale })
      setExperiencias(datos)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [JSON.stringify(filtros), locale])

  useEffect(() => {
    cargar()
  }, [cargar])

  return { experiencias, cargando, error, recargar: cargar }
}
