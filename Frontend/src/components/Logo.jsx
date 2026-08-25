import logo from '../assets/logo.png'

export default function Logo({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={logo} alt="I Guana Travel SV" className="h-12 w-auto shrink-0" />
      {!compact && (
        <div className="leading-tight">
          <span className="block text-lg font-bold text-white">I Guana</span>
          <span className="block text-xs font-semibold uppercase tracking-widest text-verde-hoja">
            Travel SV
          </span>
        </div>
      )}
    </div>
  )
}