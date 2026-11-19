import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { getContentLocale } from '../i18n/config.js'
import { localePath } from '../i18n/routes.jsx'
import { transmitirAsistente } from '../services/asistente.js'

// Bounded so a long thread cannot inflate every request's prompt.
const MAX_HISTORIAL = 8

// Folded to bare lowercase alphanumerics: the model writes "Mini-Casa en San
// Salvador," with capitals, accents and a trailing comma, and none of that
// should cost the user their link.
const plano = (texto) =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

// The model is told to quote exact titles, so the quoted title itself becomes
// the anchor. A separate pill per recommendation is easy to miss and doubles
// the vertical space taken by a message that already names the publication.
function enlazar(texto, publicaciones, alNavegar) {
  if (!publicaciones?.length) return texto

  const piezas = texto.split(/(\s+)/) // words on even indexes, separators on odd
  const palabrasTexto = piezas.map(plano)
  const salida = []
  let i = 0

  while (i < piezas.length) {
    const publicacion = publicaciones.find((p) =>
      p.titulo.split(/\s+/).map(plano).every((palabra, n) => palabra && palabrasTexto[i + n * 2] === palabra))

    if (!publicacion) {
      salida.push(piezas[i])
      i += 1
      continue
    }

    const ancho = publicacion.titulo.split(/\s+/).length
    salida.push(
      <Link
        key={`${publicacion.id}-${i}`}
        to={localePath('experienceDetail', { id: publicacion.id })}
        onClick={alNavegar}
        className="font-semibold text-verde-bosque underline underline-offset-2"
      >
        {piezas.slice(i, i + ancho * 2 - 1).join('')}
      </Link>,
    )
    i += ancho * 2 - 1
  }

  return salida
}

// Floating AI bubble, stacked above MessageLauncher's bubble (bottom-5 right-5,
// h-14). Same footprint and palette so the pair reads as one cluster.
export default function AsistenteLauncher() {
  const { t } = useTranslation('asistente')
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const refFin = useRef(null)
  const refInput = useRef(null)

  // Non-modal popover: Escape closes it, and the input takes focus on open.
  useEffect(() => {
    if (!abierto) return
    const cerrarConEscape = (e) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', cerrarConEscape)
    refInput.current?.focus()
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [abierto])

  useEffect(() => {
    refFin.current?.scrollIntoView({ block: 'end' })
  }, [mensajes, cargando, abierto])

  // Streaming target: always the last message, appended in place.
  const agregarAlUltimo = (delta) =>
    setMensajes((previos) => {
      const copia = [...previos]
      const ultimo = copia[copia.length - 1]
      copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + delta }
      return copia
    })

  async function enviar(evento) {
    evento.preventDefault()
    const pregunta = texto.trim()
    if (!pregunta || cargando) return

    const historial = mensajes
      .filter((m) => m.texto && !m.fallo)
      .slice(-MAX_HISTORIAL)
      .map((m) => ({ rol: m.autor, texto: m.texto }))

    setMensajes((previos) => [
      ...previos,
      { autor: 'usuario', texto: pregunta },
      { autor: 'asistente', texto: '', streaming: true },
    ])
    setTexto('')
    setCargando(true)

    try {
      const { publicaciones } = await transmitirAsistente(
        { mensaje: pregunta, contentLocale: getContentLocale(), historial },
        agregarAlUltimo,
      )
      setMensajes((previos) => {
        const copia = [...previos]
        const ultimo = copia[copia.length - 1]
        copia[copia.length - 1] = {
          ...ultimo,
          streaming: false,
          publicaciones,
          ...(ultimo.texto ? {} : { texto: t('sinRespuesta') }),
        }
        return copia
      })
    } catch (error) {
      setMensajes((previos) => {
        const copia = [...previos]
        const ultimo = copia[copia.length - 1]
        const aviso = error?.mensaje || t('error')
        copia[copia.length - 1] = {
          ...ultimo,
          streaming: false,
          fallo: true,
          texto: ultimo.texto ? `${ultimo.texto}\n\n${aviso}` : aviso,
        }
        return copia
      })
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={abierto ? t('burbuja.cerrar') : t('burbuja.abrir')}
        aria-expanded={abierto}
        aria-controls="asistente-panel"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-verde-bosque text-white shadow-lg transition-colors hover:bg-iguana-hondo focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-verde-bosque/40"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
          <path d="M12 3.5l1.7 4.1 4.1 1.7-4.1 1.7L12 15l-1.7-4-4.1-1.7 4.1-1.7L12 3.5Z" />
          <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
        </svg>
      </button>

      {abierto && (
        <section
          id="asistente-panel"
          aria-label={t('titulo')}
          className="fixed bottom-40 right-5 z-40 flex max-h-[70vh] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-[22px] border border-cafe-claro/40 bg-white shadow-xl"
        >
          <header className="flex shrink-0 items-start justify-between gap-2 border-b border-cafe-claro/30 bg-verde-bosque px-4 py-3 text-white">
            <div>
              <h2 className="text-sm font-bold">{t('titulo')}</h2>
              <p className="text-xs text-crema/80">{t('subtitulo')}</p>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label={t('burbuja.cerrar')}
              className="cursor-pointer rounded-full p-1.5 transition-colors hover:bg-white/15"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-crema px-3 py-2 text-sm text-cafe">
              {t('saludo')}
            </p>
            {mensajes.map((mensaje, indice) => (
              <div
                key={indice}
                className={
                  mensaje.autor === 'usuario'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-iguana-hondo px-3 py-2 text-sm text-white'
                    : `max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${mensaje.fallo ? 'bg-red-50 text-red-800' : 'bg-crema text-cafe'}`
                }
              >
                {mensaje.texto
                  ? (
                    <p className="whitespace-pre-line">
                      {enlazar(mensaje.texto, mensaje.publicaciones, () => setAbierto(false))}
                    </p>
                    )
                  : mensaje.streaming && <span className="italic text-cafe/70">{t('pensando')}</span>}
              </div>
            ))}
            <div ref={refFin} />
          </div>

          <form onSubmit={enviar} className="shrink-0 border-t border-cafe-claro/30 p-2">
            <div className="flex items-center gap-2">
              <input
                ref={refInput}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={500}
                placeholder={t('placeholder')}
                aria-label={t('placeholder')}
                className="min-w-0 flex-1 rounded-full border border-cafe-claro/50 px-3 py-2 text-sm text-cafe focus:border-verde-bosque focus:outline-none"
              />
              <button
                type="submit"
                disabled={cargando || !texto.trim()}
                aria-label={t('enviar')}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-iguana-hondo text-white transition-colors hover:bg-verde-bosque disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M4 12l16-8-6 16-2.5-6.5L4 12Z" />
                </svg>
              </button>
            </div>
            <p className="mt-1 px-2 text-[11px] text-cafe/60">{t('aviso')}</p>
          </form>
        </section>
      )}
    </>
  )
}
