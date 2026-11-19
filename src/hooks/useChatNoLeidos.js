import { useEffect, useState } from 'react'
import { getNoLeidos } from '../services/chat.js'

// Shared Header-badge poll (design decision 1): one 15 s GET /api/Chat/no-leidos
// for every authenticated role; paused while the tab is hidden with an
// immediate tick on return, and stopped the moment the session is gone
// (sign-out flips `autenticado` to false). The open-thread 4 s page poll lives
// in ChatConversation and is independent from this one.
const INTERVALO_BADGE_MS = 15000

export function useChatNoLeidos(autenticado) {
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!autenticado) {
      setTotal(0)
      return undefined
    }
    let vivo = true
    const tick = () => {
      getNoLeidos()
        .then((datos) => { if (vivo) setTotal(datos?.total ?? 0) })
        .catch(() => { /* offline poll: keep the last badge value */ })
    }
    tick()
    const intervalo = setInterval(() => {
      if (!document.hidden) tick()
    }, INTERVALO_BADGE_MS)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      vivo = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [autenticado])

  return total
}
