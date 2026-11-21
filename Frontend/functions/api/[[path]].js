const DEFAULT_API_ORIGIN = 'https://iguana-api.i-guanatravelsv.workers.dev'

export async function onRequest(context) {
  const { request, env } = context
  const apiOrigin = (env.API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/$/, '')
  const url = new URL(request.url)
  const target = new URL(`${url.pathname}${url.search}`, apiOrigin)

  return fetch(new Request(target.toString(), request))
}
