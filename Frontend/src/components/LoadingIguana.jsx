import { useTranslation } from 'react-i18next'
import logoCarga from '../assets/logo_de_carga_transparente.webp'

export default function LoadingIguana({ message, fullscreen = false }) {
  const { t } = useTranslation('common')
  // An explicit caller message always wins; null/undefined falls back to the
  // localized default. An empty string stays "no copy" (original contract).
  const texto = message ?? t('loading.default')
  const contenido = (
    <>
      <img
        src={logoCarga}
        alt=""
        className="h-36 w-auto sm:h-48"
        draggable={false}
      />
      {texto && <p className="mt-4 text-sm text-cafe">{texto}</p>}
    </>
  )

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-crema"
        role="status"
        aria-live="polite"
      >
        {contenido}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
      {contenido}
    </div>
  )
}