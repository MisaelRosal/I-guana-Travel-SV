import { useTranslation } from 'react-i18next'
import logo from '../assets/logo_alto.png'

export default function Logo() {
  const { t } = useTranslation('common')
  return (
    <img src={logo} alt={t('brand.name')} className="h-16 w-auto shrink-0" />
  )
}
