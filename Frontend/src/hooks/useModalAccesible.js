import { useEffect, useRef } from 'react'

// Elementos que pueden recibir foco dentro de un diálogo modal.
const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

// Accesibilidad de diálogos modales: mueve el foco al abrir, atrapa Tab/Shift+Tab
// dentro del diálogo, cierra con Escape y devuelve el foco al disparador.
// `activo` cubre los modales que permanecen montados y solo alternan visibilidad
// (p. ej. CrearPublicacionModal o el lightbox de la galería).
export function useModalAccesible(onCerrar, activo = true) {
  const ref = useRef(null)
  const disparadorRef = useRef(null)
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar

  useEffect(() => {
    if (!activo || !ref.current) return undefined
    const contenedor = ref.current
    disparadorRef.current = document.activeElement

    const enfocables = () => Array.from(contenedor.querySelectorAll(SELECTOR_ENFOCABLES))
    const inicial = enfocables()[0] || contenedor
    inicial.focus()

    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        // No cerrar además los menús/desplegables que escuchan a nivel global.
        e.stopPropagation()
        cerrarRef.current()
        return
      }
      if (e.key !== 'Tab') return
      e.stopPropagation()
      const items = enfocables()
      if (items.length === 0) return
      const primero = items[0]
      const ultimo = items[items.length - 1]
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primero.focus()
      }
    }

    contenedor.addEventListener('keydown', alTeclear)
    return () => {
      contenedor.removeEventListener('keydown', alTeclear)
      const disparador = disparadorRef.current
      if (disparador instanceof HTMLElement) disparador.focus()
    }
  }, [activo])

  return ref
}
