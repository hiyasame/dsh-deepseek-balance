/**
 * Self-test for the dsh-deepseek-balance host half.
 *
 * Mounts the plugin on stub Cordis contexts, captures the route each transport
 * registers, and invokes it the way the harness would. The credential and
 * endpoint resolution paths are exercised for real, so the first case makes a
 * live DeepSeek API call and needs a configured key.
 *
 * Run: node test/host.selftest.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { apply, inject, name } from '../lib/index.js'

/** Collected pass/fail lines. */
const results = []

/**
 * Read the DeepSeek key the way the real credential store does: the inherited
 * environment wins, then `$DSH_HOME/.credentials.yaml`.
 * @returns the key, or undefined while unconfigured.
 */
function selftestKey() {
  if (typeof process.env.DEEPSEEK_API_KEY === 'string' && process.env.DEEPSEEK_API_KEY !== '') {
    return process.env.DEEPSEEK_API_KEY
  }
  try {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
    const text = readFileSync(join(home, '.credentials.yaml'), 'utf8')
    return /^\s*DEEPSEEK_API_KEY:\s*(\S+)\s*$/m.exec(text)?.[1]
  } catch {
    return undefined
  }
}

/**
 * A credential stub sourcing the real key, standing in for the harness store.
 * @param source - reported provenance.
 * @returns the service stub.
 */
function credentialStub(source = 'file') {
  return {
    async resolve() {
      return { value: selftestKey(), source }
    },
  }
}

/**
 * Record one check.
 * @param label - what was checked.
 * @param fn - assertion body.
 */
async function check(label, fn) {
  try {
    await fn()
    results.push(`  ok   ${label}`)
  } catch (error) {
    results.push(`  FAIL ${label}\n         ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

/**
 * Build a stub host context.
 * @param services - extra `ctx.get` answers.
 * @param sink - collector for `ctx.effect` bodies.
 * @returns a context-shaped object.
 */
function stubContext(services, sink) {
  return {
    get: (key) => services[key],
    effect: (body) => {
      sink.push(body())
      return () => {}
    },
    webServer: services.webServer,
  }
}

/**
 * Run one plugin mount over the Connection transport.
 * @param services - service stubs.
 * @param config - plugin config.
 * @returns the registered Fetch route.
 */
function mountFetch(services, config = {}) {
  const sink = []
  apply(stubContext(services, sink), config)
  assert.equal(sink.length, 1, 'exactly one effect should be registered')
  return services.connection.routes[0]
}

/**
 * Build a Connection stub that records Fetch routes.
 * @returns the service stub.
 */
function connectionStub() {
  const routes = []
  return {
    routes,
    fetch: {
      register(route) {
        routes.push(route)
        return async () => {}
      },
    },
  }
}

console.log(`dsh-deepseek-balance host self-test (${name})`)

await check('declares webServer as its required service', () => {
  assert.deepEqual(inject, ['webServer'])
})

await check('registers the authenticated /api route on the Connection transport', () => {
  const connection = connectionStub()
  apply(stubContext({ connection }, []), {})
  assert.deepEqual(connection.routes.map((route) => route.path), ['/api/deepseek-balance'])
  assert.deepEqual(connection.routes[0].methods, ['GET', 'HEAD'])
})

let livePayload
await check('reads the live provider balance through the credential store', async () => {
  const route = mountFetch({
    connection: connectionStub(),
    credentials: credentialStub(),
  })
  const response = await route.fetch(new Request('http://127.0.0.1:3080/api/deepseek-balance'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  livePayload = await response.json()
  assert.equal(livePayload.ok, true, `payload.ok should be true, got: ${JSON.stringify(livePayload)}`)
  assert.equal(livePayload.apiKeyEnv, 'DEEPSEEK_API_KEY')
  assert.equal(livePayload.credentialSource, 'file')
  assert.equal(livePayload.baseURL, 'https://api.deepseek.com')
  assert.ok(Array.isArray(livePayload.balances) && livePayload.balances.length > 0, 'at least one balance entry')
  for (const entry of livePayload.balances) {
    assert.equal(typeof entry.currency, 'string')
    assert.equal(typeof entry.total, 'string')
    assert.equal(typeof entry.granted, 'string')
    assert.equal(typeof entry.toppedUp, 'string')
  }
  assert.equal(typeof livePayload.isAvailable, 'boolean')
})

await check('reports the default 10s refresh interval', () => {
  assert.equal(livePayload.pollMs, 10000)
})

await check('echoes a configured refresh interval', async () => {
  const route = mountFetch({ connection: connectionStub(), credentials: credentialStub() }, { pollMs: 2500 })
  const body = await (await route.fetch(new Request('http://x/api/deepseek-balance'))).json()
  assert.equal(body.pollMs, 2500)
})

await check('keeps pacing errors at the configured interval', async () => {
  const route = mountFetch({ connection: connectionStub(), credentials: credentialStub() }, { pollMs: 2500 })
  await route.fetch(new Request('http://x/api/deepseek-balance'))
  const body = await (await route.fetch(new Request('http://x/api/deepseek-balance?refresh=1'))).json()
  assert.equal(body.pollMs, 2500)
})

await check('serves the cached payload within the TTL', async () => {
  const route = mountFetch({ connection: connectionStub(), credentials: credentialStub() })
  const first = await (await route.fetch(new Request('http://x/api/deepseek-balance'))).json()
  const second = await (await route.fetch(new Request('http://x/api/deepseek-balance'))).json()
  assert.equal(first.cached, undefined)
  assert.equal(second.cached, true)
  assert.equal(second.fetchedAt, first.fetchedAt, 'cached payload should be byte-identical')
})

await check('bypasses the cache on ?refresh=1', async () => {
  const route = mountFetch({ connection: connectionStub(), credentials: credentialStub() })
  const first = await (await route.fetch(new Request('http://x/api/deepseek-balance'))).json()
  await new Promise((resolve) => setTimeout(resolve, 5))
  const forced = await (await route.fetch(new Request('http://x/api/deepseek-balance?refresh=1'))).json()
  assert.equal(forced.cached, undefined)
  assert.notEqual(forced.fetchedAt, first.fetchedAt)
})

await check('reports a missing credential instead of failing the route', async () => {
  const route = mountFetch({
    connection: connectionStub(),
    credentials: { async resolve() {} },
  }, { apiKeyEnv: 'DSH_SELFTEST_ABSENT_KEY' })
  const body = await (await route.fetch(new Request('http://x/api/deepseek-balance'))).json()
  assert.equal(body.ok, false)
  assert.equal(body.error, 'MISSING_CREDENTIAL')
  assert.match(body.message, /DSH_SELFTEST_ABSENT_KEY/)
})

await check('rejects non-GET methods', async () => {
  const route = mountFetch({ connection: connectionStub() })
  const response = await route.fetch(new Request('http://x/api/deepseek-balance', { method: 'POST' }))
  assert.equal(response.status, 405)
})

await check('falls back to a loopback-only node route without Connection', async () => {
  const routes = []
  const webServer = {
    register(route) {
      routes.push(route)
      return () => {}
    },
  }
  apply(stubContext({ webServer, credentials: credentialStub() }, []), {})
  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, '/api/deepseek-balance')
  assert.equal(routes[0].kind, 'exact')

  const denied = await new Promise((resolve) => {
    routes[0].handler(
      { url: '/api/deepseek-balance', method: 'GET', socket: { remoteAddress: '10.0.0.7' } },
      { writeHead: (status) => resolve(status), end: () => {} },
    )
  })
  assert.equal(denied, 403, 'a non-loopback peer must be rejected')

  const served = await new Promise((resolve) => {
    routes[0].handler(
      { url: '/api/deepseek-balance', method: 'GET', socket: { remoteAddress: '127.0.0.1' } },
      {
        writeHead(status) {
          this.status = status
        },
        end(text) {
          resolve({ status: this.status, body: JSON.parse(text) })
        },
      },
    )
  })
  assert.equal(served.status, 200)
  assert.equal(served.body.ok, true, `fallback payload: ${JSON.stringify(served.body)}`)
})

console.log(results.join('\n'))
if (livePayload !== undefined) {
  console.log(`\nprovider payload:\n${JSON.stringify(livePayload, null, 2)}`)
}
console.log(process.exitCode === 1 ? '\nFAILED' : '\nall checks passed')
