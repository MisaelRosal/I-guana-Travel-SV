import Logo from '../components/Logo.jsx'

export default function Footer() {
  return (
    <footer className="bg-cafe-oscuro text-crema/75 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
        <div>
          <Logo />
          <p className="mt-3">Turismo y Experiencias en El Salvador</p>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-2">Información legal</h3>
          <p>Términos y condiciones · Privacidad</p>
        </div>
        <div>
          <h3 className="text-white font-semibold mb-2">Contacto</h3>
          <p>
            ¿Quieres ofrecer tu experiencia?{' '}
            <span className="text-verde-hoja font-medium">Conviértete en anfitrión</span>
          </p>
        </div>
      </div>
    </footer>
  )
}