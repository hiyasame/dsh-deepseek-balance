/**
 * dsh-deepseek-balance — host half.
 *
 * Serves the DeepSeek account balance that the browser half renders in the
 * composer statistics strip. The route lives on Connection's authenticated
 * `/api` channel, so it inherits the browser token exchange and Host/Origin
 * checks instead of re-implementing a trust fence. Hosts without a Connection
 * service fall back to a plain loopback-only route on the same path.
 *
 * The credential and the endpoint are resolved per request, never cached
 * across requests: the DeepSeek provider is composed independently, so this
 * plugin reconstructs the same facts it uses (`apiKeyEnv`, `baseURL`) from the
 * `llm-deepseek` settings section, the launch environment, and the credential
 * store. Only the HTTP response is cached, and only for `cacheTtlMs`.
 *
 * @module dsh-deepseek-balance
 */

/** Cordis plugin name. */
export const name = 'deepseek-balance'

/** Services required before the route is mounted. */
export const inject = ['webServer']

/** Public DeepSeek API origin, matching the llm-deepseek default. */
const PUBLIC_BASE_URL = 'https://api.deepseek.com'

/** Authenticated route path on Connection's shared `/api` channel. */
const ROUTE_PATH = '/api/deepseek-balance'

/** Credential reference the DeepSeek provider reads by default. */
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/**
 * Default interval between balance refreshes, shared by the browser poll and
 * the host response cache. The cache default follows it, so a 10s poll reads
 * the provider at most once per 10s while concurrent readers share one call.
 */
const DEFAULT_POLL_MS = 10_000

/** Default provider request timeout. */
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * Read one optional Cordis service without letting a missing or half-mounted
 * service turn into a load failure.
 * @param ctx - host context.
 * @param key - service key.
 * @returns the service, or undefined when absent.
 */
function optionalService(ctx, key) {
  try {
    return ctx.get(key)
  } catch {
    return undefined
  }
}

/**
 * Resolve the configured provider endpoint, mirroring llm-deepseek's own
 * precedence: explicit plugin config, then the settings section, then the
 * launch environment, then the public API origin.
 * @param ctx - host context.
 * @param config - resolved plugin config.
 * @returns endpoint origin without a trailing slash.
 */
function resolveBaseUrl(ctx, config) {
  const section = readSettingsSection(ctx)
  const candidates = [
    config.baseURL,
    typeof section?.baseURL === 'string' ? section.baseURL : undefined,
    process.env.DEEPSEEK_BASE_URL,
    readLaunchEnvironment(ctx, 'DEEPSEEK_BASE_URL'),
    PUBLIC_BASE_URL,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim().replace(/\/+$/, '')
    }
  }
  return PUBLIC_BASE_URL
}

/**
 * Read the DeepSeek provider's settings section when a settings service is
 * composed. Never throws: an absent or unreadable section falls back to the
 * provider defaults.
 * @param ctx - host context.
 * @returns the section object, or undefined.
 */
function readSettingsSection(ctx) {
  try {
    const settings = optionalService(ctx, 'settings')
    if (settings === undefined || typeof settings.get !== 'function') return undefined
    const section = settings.get('llm-deepseek')
    return typeof section === 'object' && section !== null ? section : undefined
  } catch {
    return undefined
  }
}

/**
 * Read one variable from the launch environment service (the trusted
 * environment layer the harness was started with).
 * @param ctx - host context.
 * @param name - variable name.
 * @returns the value, or undefined.
 */
function readLaunchEnvironment(ctx, name) {
  try {
    const environment = optionalService(ctx, 'launchEnvironment')
    if (environment === undefined || typeof environment.get !== 'function') return undefined
    const hit = environment.get(name)
    return typeof hit?.value === 'string' ? hit.value : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the credential reference the provider uses.
 * @param ctx - host context.
 * @param config - resolved plugin config.
 * @returns the environment-variable name standing behind the key.
 */
function resolveApiKeyEnv(ctx, config) {
  const section = readSettingsSection(ctx)
  if (typeof config.apiKeyEnv === 'string' && config.apiKeyEnv.trim() !== '') return config.apiKeyEnv.trim()
  if (typeof section?.apiKeyEnv === 'string' && section.apiKeyEnv.trim() !== '') return section.apiKeyEnv.trim()
  return DEFAULT_API_KEY_ENV
}

/**
 * Resolve the API key through the credential store, then the process
 * environment. Resolution happens per operation by design, so a key changed in
 * the Models page reaches the next request without a restart.
 * @param ctx - host context.
 * @param apiKeyEnv - credential reference to resolve.
 * @returns the key and its source, or undefined while unconfigured.
 */
async function resolveApiKey(ctx, apiKeyEnv) {
  const credentials = optionalService(ctx, 'credentials')
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      const hit = await credentials.resolve(apiKeyEnv)
      if (typeof hit?.value === 'string' && hit.value !== '') {
        return { value: hit.value, source: typeof hit.source === 'string' ? hit.source : 'credentials' }
      }
    } catch {
      // Fall through to the process environment.
    }
  }
  const fromEnv = process.env[apiKeyEnv]
  if (typeof fromEnv === 'string' && fromEnv !== '') return { value: fromEnv, source: 'env' }
  return undefined
}

/**
 * Normalize one provider balance entry. The provider returns decimal strings,
 * which are kept as strings so no precision is lost in transit.
 * @param entry - one `balance_infos` element.
 * @returns the display-ready entry.
 */
function normalizeBalance(entry) {
  return {
    currency: typeof entry?.currency === 'string' ? entry.currency : '',
    total: typeof entry?.total_balance === 'string' ? entry.total_balance : String(entry?.total_balance ?? '0'),
    granted: typeof entry?.granted_balance === 'string' ? entry.granted_balance : String(entry?.granted_balance ?? '0'),
    toppedUp: typeof entry?.topped_up_balance === 'string' ? entry.topped_up_balance : String(entry?.topped_up_balance ?? '0'),
  }
}

/**
 * Message text from an arbitrary rejection.
 * @param error - rejected value.
 * @returns display-ready message.
 */
function messageOf(error) {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'TimeoutError'
      ? 'provider request timed out'
      : error.message
  }
  return String(error)
}

/**
 * Mount the balance route.
 * @param ctx - host context.
 * @param config - optional plugin config.
 */
export function apply(ctx, config = {}) {
  const pollMs = Number.isFinite(config.pollMs) && config.pollMs > 0 ? config.pollMs : DEFAULT_POLL_MS
  const resolved = {
    pollMs,
    cacheTtlMs: Number.isFinite(config.cacheTtlMs) && config.cacheTtlMs >= 0 ? config.cacheTtlMs : pollMs,
    timeoutMs: Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS,
  }

  /** Last successful-or-failed payload, with the instant it was produced. */
  const cache = { at: 0, payload: undefined }
  /** In-flight read shared by concurrent requests. */
  let inflight

  /**
   * Query the provider balance endpoint.
   * @param force - skip the cached payload.
   * @returns the wire payload the client renders.
   */
  async function readBalance(force) {
    const now = Date.now()
    if (!force && cache.payload !== undefined && now - cache.at < resolved.cacheTtlMs) {
      return { ...cache.payload, cached: true }
    }
    if (inflight !== undefined) return inflight
    inflight = fetchBalance()
      .then((payload) => {
        cache.at = Date.now()
        cache.payload = payload
        return payload
      })
      .finally(() => {
        inflight = undefined
      })
    return inflight
  }

  /**
   * Perform the provider call and shape the wire payload.
   * @returns the wire payload.
   */
  async function fetchBalance() {
    const apiKeyEnv = resolveApiKeyEnv(ctx, config)
    const baseURL = resolveBaseUrl(ctx, config)
    const credential = await resolveApiKey(ctx, apiKeyEnv)
    if (credential === undefined) {
      return {
        ok: false,
        error: 'MISSING_CREDENTIAL',
        message: `no value for ${apiKeyEnv}; set it in the Models page or export it`,
        apiKeyEnv,
        baseURL,
        fetchedAt: new Date().toISOString(),
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), resolved.timeoutMs)
    try {
      const response = await fetch(`${baseURL}/user/balance`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${credential.value}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      })
      const text = await response.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        return {
          ok: false,
          error: 'BAD_RESPONSE',
          message: `provider returned HTTP ${response.status} with a non-JSON body`,
          baseURL,
          fetchedAt: new Date().toISOString(),
        }
      }
      if (!response.ok) {
        return {
          ok: false,
          error: 'PROVIDER_ERROR',
          status: response.status,
          message: typeof body?.error?.message === 'string' ? body.error.message : `provider returned HTTP ${response.status}`,
          baseURL,
          fetchedAt: new Date().toISOString(),
        }
      }
      const infos = Array.isArray(body?.balance_infos) ? body.balance_infos : []
      return {
        ok: true,
        isAvailable: body?.is_available === true,
        balances: infos.map(normalizeBalance),
        credentialSource: credential.source,
        apiKeyEnv,
        baseURL,
        fetchedAt: new Date().toISOString(),
      }
    } catch (error) {
      return {
        ok: false,
        error: 'NETWORK',
        message: messageOf(error),
        baseURL,
        fetchedAt: new Date().toISOString(),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Answer one HTTP request.
   * @param request - Fetch-shaped request.
   * @returns the JSON response.
   */
  async function handle(request) {
    const url = new URL(request.url)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return Response.json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, { status: 405 })
    }
    const payload = await readBalance(url.searchParams.get('refresh') === '1')
    return Response.json({ ...payload, pollMs: resolved.pollMs }, {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    })
  }

  /**
   * Whether a plain (unauthenticated) request may reach the route. Used only on
   * the fallback transport, where Connection's trust fence is unavailable.
   * @param request - node request.
   * @returns true when the peer is loopback.
   */
  function loopbackOnly(request) {
    const address = request?.socket?.remoteAddress
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  }

  ctx.effect(() => {
    const connection = optionalService(ctx, 'connection')
    if (connection?.fetch !== undefined && typeof connection.fetch.register === 'function') {
      return connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: (request) => handle(request),
      })
    }
    return ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PATH,
      handler: async (request, response) => {
        if (!loopbackOnly(request)) {
          response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
          response.end(JSON.stringify({ ok: false, error: 'FORBIDDEN' }))
          return
        }
        const payload = await readBalance(new URL(request.url ?? ROUTE_PATH, 'http://localhost').searchParams.get('refresh') === '1')
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        })
        response.end(JSON.stringify({ ...payload, pollMs: resolved.pollMs }))
      },
    })
  }, 'deepseek-balance: balance route')
}
