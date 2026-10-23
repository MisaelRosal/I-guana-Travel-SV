import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getContentLocale, useFormatLocale } from '../../i18n/config.js'
import { formatMonthYear } from '../../i18n/format.js'
import { localePath } from '../../i18n/routes.jsx'
import { restaurarSesion } from '../../services/session.js'
import { getGuardadas } from '../../services/favoritos.js'
import { getResumenUsuario } from '../../services/resenas.js'
import useFavoritos from '../../hooks/useFavoritos.js'
import { Estrellas } from '../../components/Estrellas.jsx'
import ExperienceCard from '../../components/ExperienceCard.jsx'
import Toast from '../../components/Toast.jsx'

// Phase 1 of the guest account profile: identity data comes from the server
// session (GET /Auth/me via restaurarSesion), never from the sessionStorage
// cache. User ratings fetched from GET /Resena/usuario/:id (hosts rate guests
// post-reservation). Saved listings come from Fase 2 (GET /api/Favorito/mios):
// the server scopes them to the session's `sub`, so this page only paints what
// the API returns.
function iniciales(nombre, apellido) {
  const n = (nombre || '').trim()
  const a = (apellido || '').trim()
  return ((n.charAt(0) || '') + (a.charAt(0) || '')).toUpperCase() || '·'
}

function Avatar({ usuario }) {
  const { t } = useTranslation('cuenta')
  return (
    <div
      className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-crema text-4xl font-bold text-cafe"
      role="img"
      aria-label={t('avatarAlt')}
    >
      {iniciales(usuario.nombre, usuario.apellido)}
    </div>
  )
}

export default function MiCuentaPage() {
  const { t, i18n } = useTranslation('cuenta')
  const navigate = useNavigate()
  const locale = useFormatLocale()
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)
  // Fase 2: publicaciones guardadas reales (API) y su toggle de quitar.
  const [guardadas, setGuardadas] = useState([])
  const [cargandoGuardadas, setCargandoGuardadas] = useState(true)
  // Calificación del usuario (recibida de anfitriones post-reserva)
  const [resumenUsuario, setResumenUsuario] = useState({ promedio: 0, total: 0 })
  const [cargandoRating, setCargandoRating] = useState(true)
  const [aviso, setAviso] = useState(null)
  const { alternar, error: errorFavoritos } = useFavoritos()

  useEffect(() => {
    let activo = true
    // Revalidate against the HttpOnly auth cookie: a stale cache or an expired
    // session resolves to null and sends the visitor to sign in.
    restaurarSesion()
      .then((sesion) => {
        if (!activo) return
        if (!sesion) {
          navigate(localePath('login'), { replace: true })
          return
        }
        setUsuario(sesion)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [navigate])

  // Cargar calificación del usuario cuando tenemos la sesión
  useEffect(() => {
    let activo = true
    if (!usuario) {
      setCargandoRating(false)
      return () => { activo = false }
    }
    setCargandoRating(true)
    getResumenUsuario(usuario.id)
      .then((r) => { if (activo) setResumenUsuario(r || { promedio: 0, total: 0 }) })
      .catch(() => { if (activo) setResumenUsuario({ promedio: 0, total: 0 }) })
      .finally(() => { if (activo) setCargandoRating(false) })
    return () => { activo = false }
  }, [usuario])

  // La lista de guardadas se pide con el mismo `contentLocale` del catálogo, así
  // los títulos cambian de idioma igual que en las lecturas públicas.
  useEffect(() => {
    let activo = true
    if (!usuario) {
      setCargandoGuardadas(false)
      return () => { activo = false }
    }
    setCargandoGuardadas(true)
    getGuardadas(getContentLocale(i18n.resolvedLanguage || i18n.language))
      .then((lista) => { if (activo) setGuardadas(lista) })
      .catch(() => {
        if (activo) {
          setGuardadas([])
          setAviso(t('saved.loadError'))
        }
      })
      .finally(() => { if (activo) setCargandoGuardadas(false) })
    return () => { activo = false }
  }, [usuario, i18n.resolvedLanguage, i18n.language, t])

  // Reuso del mismo toast: un fallo del toggle (optimismo revertido) se avisa
  // aquí y se cierra con el X del componente.
  useEffect(() => {
    if (errorFavoritos > 0) setAviso(t('experiencia:favoritos.error'))
  }, [errorFavoritos, t])

  // Quitar una guardada: si el servidor confirma, la card sale de la lista;
  // si falla, useFavoritos ya revirtió y la lista queda intacta.
  const alternarGuardada = async (publicacionId) => {
    const resultado = await alternar(publicacionId)
    if (resultado.ok && !resultado.guardado) {
      setGuardadas((prev) => prev.filter((e) => e.id !== publicacionId))
    }
    return resultado
  }

  if (cargando) {
    return (
      <div className="flex justify-center px-4 py-20">
        <p className="text-cafe">{t('loading')}</p>
      </div>
    )
  }

  if (!usuario) return null

  const rol = usuario.rol ?? 'usuario'
  const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ')

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link to={localePath('catalog')} className="mb-4 block font-medium text-azul hover:text-verde-hoja">
        {t('back')}
      </Link>

      <div className="rounded-[22px] border border-cafe-claro/60 bg-white p-5 sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar usuario={usuario} />
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-verde-bosque">{nombreCompleto}</h1>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1 rounded-full bg-verde-hoja/15 px-3 py-1 text-xs font-semibold text-verde-bosque">
                {t(`roles.${rol}`, { defaultValue: rol })}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                  usuario.emailVerificado ? 'bg-verde-hoja/15 text-verde-bosque' : 'bg-amber/10 text-verde-bosque'
                }`}
              >
                {usuario.emailVerificado ? t('verification.verified') : t('verification.pending')}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-neutral-100 pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-cafe">{t('view.email')}</dt>
            <dd className="mt-0.5 break-all text-neutral-800">{usuario.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-cafe">{t('view.phone')}</dt>
            <dd className="mt-0.5 text-neutral-800">{usuario.telefono || t('view.notAvailable')}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-cafe">{t('view.role')}</dt>
            <dd className="mt-0.5 text-neutral-800">{t(`roles.${rol}`, { defaultValue: rol })}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-cafe">{t('view.memberSince')}</dt>
            <dd className="mt-0.5 text-neutral-800">
              {usuario.createdAt ? formatMonthYear(usuario.createdAt, locale) : t('view.notAvailable')}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-[22px] border border-cafe-claro/60 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-verde-bosque">{t('rating.title')}</h2>
          {cargandoRating ? (
            <div className="mt-3 flex items-center gap-2">
              <Estrellas valor={0} className="h-5 w-5 opacity-50" />
              <span className="text-sm text-cafe">{t('rating.loading')}</span>
            </div>
          ) : resumenUsuario.total > 0 ? (
            <div className="mt-3 flex items-center gap-2">
              <Estrellas valor={resumenUsuario.promedio} className="h-5 w-5" />
              <span className="text-sm font-bold text-neutral-800">{Number(resumenUsuario.promedio).toFixed(1)}</span>
              <span className="text-sm text-cafe">
                · {t('rating.count', { count: resumenUsuario.total })}
              </span>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-2">
                <Estrellas valor={0} className="h-5 w-5" />
                <span className="text-sm font-medium text-cafe">{t('rating.empty')}</span>
              </div>
              <p className="mt-2 text-sm text-cafe">{t('rating.hint')}</p>
            </>
          )}
        </section>

        <section className="rounded-[22px] border border-cafe-claro/60 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-verde-bosque">{t('saved.title')}</h2>
          <p className="mt-3 text-sm text-cafe">
            {cargandoGuardadas
              ? t('saved.loading')
              : guardadas.length === 0
                ? t('saved.empty')
                : t('saved.count', { count: guardadas.length })}
          </p>
          <Link
            to={localePath('catalog')}
            className="mt-4 inline-block rounded-full bg-iguana-hondo px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-verde-bosque"
          >
            {t('saved.cta')}
          </Link>
        </section>
      </div>

      {/* Guardadas reales: las mismas cards del catálogo, siempre en estado
          "guardado"; el corazón las quita y refresca el contador de arriba. */}
      {!cargandoGuardadas && guardadas.length > 0 && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {guardadas.map((e) => (
            <ExperienceCard
              key={e.id}
              experiencia={e}
              guardado
              onToggleGuardado={alternarGuardada}
            />
          ))}
        </div>
      )}

      <Toast mensaje={aviso} tipo="error" onCerrar={() => setAviso(null)} />
    </div>
  )
}
