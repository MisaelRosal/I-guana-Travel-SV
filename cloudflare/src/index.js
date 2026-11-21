import { Container, getContainer } from '@cloudflare/containers'

const DEFAULT_API_BASE_URL = 'https://iguana-api.i-guanatravelsv.workers.dev'

function apiBaseUrl(env) {
  return (env.API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '')
}

function toNpgsql(connectionString) {
  if (!connectionString) {
    throw new Error('NEON_POOLED_URL is required')
  }

  const url = new URL(connectionString)
  const username = decodeURIComponent(url.username)
  const password = decodeURIComponent(url.password)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const port = url.port || '5432'

  return `Host=${url.hostname};Port=${port};Database=${database};Username=${username};Password=${password};SSL Mode=Require;Trust Server Certificate=true`
}

async function forwardRequest(request, target) {
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  return new Request(target.toString(), init)
}

function backendEnvironment(env) {
  const apiBase = apiBaseUrl(env)

  return {
    ASPNETCORE_ENVIRONMENT: 'Production',
    ASPNETCORE_URLS: 'http://0.0.0.0:8080',
    TZ: 'America/El_Salvador',
    ConnectionStrings__DefaultConnection: toNpgsql(env.NEON_POOLED_URL),
    Minio__Endpoint: env.R2_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    Minio__AccessKey: env.R2_ACCESS_KEY_ID,
    Minio__SecretKey: env.R2_SECRET_ACCESS_KEY,
    Minio__BucketName: env.R2_BUCKET,
    Minio__PublicEndpoint: env.R2_PUBLIC_URL,
    Minio__MaxUploadBytes: '5242880',
    Minio__UseSSL: 'true',
    Minio__Region: 'auto',
    Minio__ManageBucketPolicy: 'false',
    Minio__PublicUrlIncludesBucket: 'false',
    Jwt__Key: env.JWT_KEY,
    Jwt__Issuer: 'iguana-sv-api',
    Jwt__Audience: 'iguana-sv-spa',
    Jwt__ExpiresInMinutes: '60',
    CORS__ALLOWED_ORIGINS: env.FRONTEND_BASE_URL,
    Email__From: env.EMAIL_FROM,
    Email__VerificacionHabilitada: 'true',
    Email__GoogleClientId: env.GOOGLE_CLIENT_ID,
    Email__GoogleClientSecret: env.GOOGLE_CLIENT_SECRET,
    Email__GoogleRefreshToken: env.GOOGLE_REFRESH_TOKEN || '',
    Email__GoogleRedirectUri: `${apiBase}/oauth2callback`,
    Email__SitioUrl: env.FRONTEND_BASE_URL,
    Translation__LibreTranslate__Enabled: 'true',
    Translation__LibreTranslate__BaseUrl: apiBase,
    Translation__LibreTranslate__TimeoutSeconds: '120',
    Asistente__Enabled: 'false',
  }
}

export class BackendContainer extends Container {
  defaultPort = 8080
  sleepAfter = '15m'
  enableInternet = true
  pingEndpoint = '/health'

  constructor(ctx, env) {
    super(ctx, env)
    this.envVars = backendEnvironment(env)
  }
}

export class TranslateContainer extends Container {
  defaultPort = 5000
  sleepAfter = '30m'
  enableInternet = true
  pingEndpoint = '/health'
  envVars = {
    LT_LOAD_ONLY: 'es,en',
    LT_CHAR_LIMIT: '1200',
    LT_BATCH_LIMIT: '2',
    ARGOS_PACKAGE_INDEX:
      'https://raw.githubusercontent.com/argosopentech/argospm-index/ff90de60728f7c1338ff6b75974e4c89b2442d22/',
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/translate' || url.pathname.startsWith('/translate/')) {
      const target = new URL(request.url)
      target.pathname =
        url.pathname === '/translate' ? '/translate' : url.pathname.slice('/translate'.length)

      const forwarded = await forwardRequest(request, target)
      return getContainer(env.TRANSLATE_CONTAINER, 'libretranslate').fetch(forwarded)
    }

    const forwarded = await forwardRequest(request, request.url)
    forwarded.headers.set('X-Forwarded-Proto', 'https')
    const clientIp = request.headers.get('CF-Connecting-IP')
    if (clientIp) {
      forwarded.headers.set('X-Forwarded-For', clientIp)
    }

    return getContainer(env.BACKEND_CONTAINER, 'backend').fetch(forwarded)
  },
}
