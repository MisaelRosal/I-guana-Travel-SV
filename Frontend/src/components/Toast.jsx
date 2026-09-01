import { useEffect, useState } from 'react'

export default function Toast({ mensaje, tipo, onCerrar }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!mensaje) return
    const t1 = setTimeout(() => setVisible(true), 50)
    const t2 = setTimeout(() => {
      setVisible(false)
      if (onCerrar) setTimeout(onCerrar, 300)
    }, 3500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [mensaje, onCerrar])

  if (!mensaje) return null

  const esExito = tipo === 'exito'

  return (
    <div
      className={`fixed top-5 right-5 z-[2000] flex items-center gap-3 rounded-lg px-4 py-3 shadow-xl transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      } ${esExito ? 'bg-verde-bosque text-white' : 'bg-red-600 text-white'}`}
      role="status"
    >
      {esExito ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      )}
      <span className="text-sm font-semibold">{mensaje}</span>
      <button
        type="button"
        onClick={() => { setVisible(false); setTimeout(onCerrar, 300) }}
        className="ml-2 cursor-pointer rounded p-0.5 opacity-80 transition-opacity hover:opacity-100"
        aria-label="Cerrar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
