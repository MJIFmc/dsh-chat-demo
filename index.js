/**
 * Host half of the dsh-chat-demo bundle.
 *
 * Serves the official DeepSeek chat-demo static build under `/chat-demo/`, and
 * shares this DSH's DeepSeek configuration with it:
 *
 * - `GET /chat-demo/config` reports whether the local DSH manages the API
 *   credential and lists the DeepSeek models this DSH can serve.
 * - `/chat-demo/api/*` is a same-origin proxy to https://api.deepseek.com. It
 *   injects the credential resolved from the DSH account sign-in (preferred) or
 *   the `DEEPSEEK_API_KEY` credential reference, so the browser never stores an
 *   API key and the chat page uses the same configuration as DSH itself.
 *
 * The chat-demo build must be produced with `CHAT_DEMO_API_ORIGIN=/chat-demo/api`
 * so its requests land on the proxy.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST_ROOT = path.join(HERE, 'dist')
const PUBLIC_PREFIX = '/chat-demo'
const API_PREFIX = '/chat-demo/api'
const CONFIG_PATH = '/chat-demo/config'
const UPSTREAM = 'https://api.deepseek.com'
/** Messages transport base the DSH account service validates its token against. */
const INFERENCE_BASE = `${UPSTREAM}/anthropic`
const API_KEY_REF = 'DEEPSEEK_API_KEY'

const FALLBACK_MODELS = [
  {
    id: 'deepseek-flash',
    name: 'DeepSeek V4.1 Flash',
    image: true,
    thinking: true,
    features: { serverTools: true, title: true, reminders: true, image: true },
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    image: false,
    thinking: true,
    features: { serverTools: false, title: false, reminders: false, image: false },
  },
]

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

/** Headers the proxy must not copy from the upstream response. */
const DROPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
])

const sendJson = (res, status, payload) => {
  if (res.headersSent) {
    res.end()
    return
  }
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

const notFound = (res) => {
  res.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end('Not found')
}

/**
 * Resolve the credential DSH itself would use for the DeepSeek API: the account
 * grant first, then the `DEEPSEEK_API_KEY` credential reference.
 * @returns {{ mode: 'account' | 'apiKey', name: string, value: string } | null}
 */
const resolveCredential = async (ctx) => {
  const account = ctx.get('deepseekAccount')
  if (account !== undefined && typeof account.resolveToken === 'function') {
    try {
      const token = await account.resolveToken(INFERENCE_BASE)
      if (typeof token === 'string' && token.length > 0) {
        return { mode: 'account', name: 'x-dsh-auth-token', value: token }
      }
    } catch {
      // Not signed in, or the destination is not authorized; fall back to an API key.
    }
  }
  const credentials = ctx.get('credentials')
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const hit = await credentials.resolve(API_KEY_REF)
      if (hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0) {
        return { mode: 'apiKey', name: 'x-api-key', value: hit.value }
      }
    } catch {
      // A malformed or unreadable reference behaves like an absent one here.
    }
  }
  return null
}

/** DeepSeek model catalog from the live `llm` service, with a built-in fallback. */
const listModels = async (ctx) => {
  const llm = ctx.get('llm')
  if (llm !== undefined && typeof llm.listModels === 'function') {
    let providers = []
    try {
      const listed = typeof llm.listProviders === 'function' ? llm.listProviders() : []
      providers = (listed ?? [])
        .map((provider) => provider?.id)
        .filter((id) => typeof id === 'string' && /^deepseek-/.test(id))
    } catch {
      providers = []
    }
    if (providers.length === 0) {
      providers = ['deepseek-account', 'deepseek-official']
    }
    const seen = new Set()
    const models = []
    for (const provider of providers) {
      try {
        const listed = await llm.listModels(provider)
        for (const model of listed ?? []) {
          if (typeof model?.id !== 'string' || model.id.length === 0 || seen.has(model.id)) {
            continue
          }
          seen.add(model.id)
          // chat-demo's protocol carries DeepSeek-only request extensions: the
          // server-side read-url/web-search tools and server-side title
          // generation. The flash line supports them; other models reject them
          // with HTTP 400, so advertise the capability per model.
          const flashLike = /^deepseek-flash/i.test(model.id)
          const image = Array.isArray(model.inputModalities)
            ? model.inputModalities.includes('image')
            : flashLike
          models.push({
            id: model.id,
            name: typeof model.name === 'string' && model.name.length > 0 ? model.name : model.id,
            ...(typeof model.description === 'string' && model.description.length > 0
              ? { description: model.description }
              : {}),
            image,
            thinking: true,
            features: { serverTools: flashLike, title: flashLike, reminders: flashLike, image },
          })
        }
      } catch {
        // Keep the other routes' catalogs, then the built-in fallback.
      }
    }
    if (models.length > 0) {
      return models
    }
  }
  return FALLBACK_MODELS
}

/** The model this DSH's default agent selection uses, when the catalog offers it. */
const defaultModelId = (ctx, models) => {
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (typeof selection?.model === 'string' && models.some((model) => model.id === selection.model)) {
      return selection.model
    }
  } catch {
    // Fall through to the built-in preference.
  }
  return models.find((model) => model.id === 'deepseek-flash')?.id ?? models[0]?.id ?? 'deepseek-flash'
}

/**
 * Reject requests that do not come from this DSH's authenticated browser
 * session (the same fence the shipped `/api`, `/open-in-app/*` routes use).
 * @returns true when the request was already answered with a rejection.
 */
const rejected = (ctx, req, res) => {
  const connection = ctx.get('connection')
  if (connection === undefined || typeof connection.requestRejection !== 'function') {
    return false
  }
  const rejection = connection.requestRejection(req)
  if (rejection === undefined) {
    return false
  }
  res.statusCode = rejection
  res.end()
  return true
}

const handleConfig = async (req, res, ctx) => {
  if (rejected(ctx, req, res)) {
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: { type: 'method_not_allowed', message: 'GET only' } })
    return
  }
  try {
    const [models, credential] = await Promise.all([listModels(ctx), resolveCredential(ctx)])
    sendJson(res, 200, {
      version: 1,
      managed: true,
      auth: { mode: credential === null ? 'none' : credential.mode },
      models,
      defaultModel: defaultModelId(ctx, models),
    })
  } catch (error) {
    sendJson(res, 500, {
      error: { type: 'config_error', message: String(error?.message ?? error) },
    })
  }
}

/**
 * Forward chat-demo's API calls to the official DeepSeek API with the DSH
 * credential attached. Streaming responses (SSE) and request bodies are piped.
 */
const handleApi = async (req, res, ctx) => {
  if (rejected(ctx, req, res)) {
    return
  }
  let controller
  let onClose
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const rest = url.pathname.slice(API_PREFIX.length) || '/'
    if (rest.includes('\0') || rest.includes('..')) {
      sendJson(res, 400, { error: { type: 'bad_path', message: 'Invalid API path' } })
      return
    }
    const target = new URL(`${UPSTREAM}${rest}`)
    target.search = url.search

    const credential = await resolveCredential(ctx)
    if (credential === null) {
      sendJson(res, 401, {
        error: {
          type: 'dsh_credential_required',
          message:
            '本机 DSH 还没有可用的 DeepSeek 凭据。请先在 DSH 设置中登录 DeepSeek 账号，或配置 DEEPSEEK_API_KEY 后重试。',
        },
      })
      return
    }

    const headers = {}
    for (const name of [
      'content-type',
      'accept',
      'accept-language',
      'anthropic-beta',
      'anthropic-version',
    ]) {
      const value = req.headers[name]
      if (typeof value === 'string' && value.length > 0) {
        headers[name] = value
      }
    }
    headers[credential.name] = credential.value
    headers['user-agent'] = 'dsh-chat-demo/0.1.0'

    const method = req.method ?? 'GET'
    const init = { method, headers, redirect: 'error' }
    if (method !== 'GET' && method !== 'HEAD') {
      init.body = Readable.toWeb(req)
      init.duplex = 'half'
    }

    controller = new AbortController()
    onClose = () => {
      if (!res.writableEnded) {
        controller.abort()
      }
    }
    res.on('close', onClose)

    const upstream = await fetch(target, { ...init, signal: controller.signal })

    const responseHeaders = {}
    upstream.headers.forEach((value, name) => {
      if (!DROPPED_RESPONSE_HEADERS.has(name)) {
        responseHeaders[name] = value
      }
    })
    responseHeaders['cache-control'] = 'no-store'
    res.writeHead(upstream.status, responseHeaders)

    if (upstream.body === null) {
      res.end()
      return
    }
    const reader = Readable.fromWeb(upstream.body)
    for await (const chunk of reader) {
      if (res.destroyed) {
        break
      }
      if (!res.write(chunk)) {
        try {
          await once(res, 'drain')
        } catch {
          break
        }
      }
    }
    if (!res.writableEnded) {
      res.end()
    }
  } catch (error) {
    if (res.writableEnded) {
      return
    }
    if (error?.name === 'AbortError') {
      res.destroy()
      return
    }
    const message = String(error?.cause?.message ?? error?.message ?? error)
    if (!res.headersSent) {
      sendJson(res, 502, { error: { type: 'upstream_error', message } })
    } else {
      res.end()
    }
    console.error('[dsh-chat-demo] proxy error:', message)
  } finally {
    if (onClose !== undefined) {
      res.off('close', onClose)
    }
  }
}

/** Serve the chat-demo static build from `<package>/dist`. */
const handleStatic = async (req, res, ctx) => {
  if (rejected(ctx, req, res)) {
    return
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' })
    res.end('Method not allowed')
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    sendJson(res, 400, { error: { type: 'bad_path', message: 'Invalid path' } })
    return
  }
  let relative = pathname.slice(PUBLIC_PREFIX.length)
  if (relative.length === 0) {
    relative = '/'
  }
  if (relative.endsWith('/')) {
    relative += 'index.html'
  }
  const filePath = path.resolve(DIST_ROOT, `.${relative}`)
  if (filePath !== DIST_ROOT && !filePath.startsWith(`${DIST_ROOT}${path.sep}`)) {
    notFound(res)
    return
  }
  let info
  try {
    info = await stat(filePath)
  } catch {
    notFound(res)
    return
  }
  if (!info.isFile()) {
    notFound(res)
    return
  }
  const extension = path.extname(filePath).toLowerCase()
  const contentType =
    MIME_TYPES[extension] ??
    (path.basename(filePath) === 'LICENSE' ? 'text/plain; charset=utf-8' : 'application/octet-stream')
  const hashedAsset = pathname.startsWith(`${PUBLIC_PREFIX}/static/`)
  res.writeHead(200, {
    'content-type': contentType,
    'content-length': info.size,
    'cache-control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) {
        notFound(res)
      } else {
        res.destroy()
      }
    })
    .pipe(res)
}

export const inject = ['webServer']

/**
 * Register the three chat-demo routes on the DSH Web server.
 * @param ctx - owning Host context.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: CONFIG_PATH,
        handler: (req, res) => handleConfig(req, res, ctx),
      }),
    'chat-demo: shared config route'
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: (req, res) => handleApi(req, res, ctx),
      }),
    'chat-demo: shared API proxy'
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: PUBLIC_PREFIX,
        handler: (req, res) => handleStatic(req, res, ctx),
      }),
    'chat-demo: static site'
  )
}
