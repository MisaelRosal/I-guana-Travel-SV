import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { localePath } from '../../i18n/routes.jsx'

// A7: wildcard catch-all screen. Mounted by App.jsx's layout route (path '*'),
// so header/footer keep rendering around it like every other page.
export default function NotFoundPage() {
  const { t } = useTranslation('common')
  return (
    <div className="mx-auto max-w-5xl px-4 py-20 text-center">
      <h1 className="text-3xl font-bold text-verde-bosque">{t('notFound.title')}</h1>
      <p className="mt-2 text-cafe">{t('notFound.body')}</p>
      <Link
        to={localePath('catalog')}
        className="mt-6 inline-block cursor-pointer rounded-full bg-iguana-hondo px-6 py-2.5 font-semibold text-white transition-colors hover:bg-verde-bosque"
      >
        {t('notFound.back')}
      </Link>
    </div>
  )
}
