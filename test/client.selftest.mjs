/**
 * Self-test for the dsh-deepseek-balance browser half.
 *
 * Loads `lib/client.js` the way the shell does — through
 * `window.__ModuleLoader__` — and drives the registered component with a
 * minimal React hook shim, so the slot wiring, the dictionaries, the fetch
 * contract, and every rendered state are checked without a browser.
 *
 * Run: node test/client.selftest.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Collected pass/fail lines. */
const results = []

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
 * Minimal document stand-in covering the CSS injection and the dismiss
 * listeners.
 * @returns the stub with its recorded styles and listeners.
 */
function documentStub() {
  const styles = []
  const listeners = []
  return {
    styles,
    listeners,
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (tag) => styles.push(tag) },
    addEventListener: (type, handler) => listeners.push({ type, handler }),
    removeEventListener: (type, handler) => {
      const index = listeners.findIndex((entry) => entry.type === type && entry.handler === handler)
      if (index !== -1) listeners.splice(index, 1)
    },
  }
}

/**
 * Load the bundle through a stubbed module loader.
 * @returns the captured registration, the built module, and the harnesses.
 */
function loadBundle() {
  const source = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8')
  let registration
  const window = {
    __ModuleLoader__: {
      load(entry) {
        registration = entry
      },
    },
  }
  const doc = documentStub()

  /** Per-render hook capture plus the state overrides the caller sets. */
  const hooks = {
    overrides: [],
    states: [],
    setters: [],
    effects: [],
    render(fn, props) {
      hooks.states = []
      hooks.setters = []
      hooks.effects = []
      return fn(props)
    },
  }

  const react = {
    Fragment: Symbol('react.fragment'),
    createElement: (type, props, ...children) => {
      const element = { type, props: props === null || props === undefined ? {} : props, children, style: {} }
      // Wire object refs the way a renderer would, so placement can find the row.
      const ref = element.props.ref
      if (ref !== null && typeof ref === 'object') ref.current = element
      return element
    },
    memo: (fn) => fn,
    useState(initial) {
      const index = hooks.states.length
      const override = hooks.overrides[index]
      hooks.states.push(override !== undefined ? override : typeof initial === 'function' ? initial() : initial)
      return [hooks.states[index], (value) => hooks.setters.push({ index, value })]
    },
    useEffect(body) {
      hooks.effects.push(body)
      return undefined
    },
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
  }

  const requireStub = (specifier) => {
    if (specifier === 'react') return react
    throw new Error(`undeclared module request: ${specifier}`)
  }

  // eslint-disable-next-line no-new-func -- the bundle is a factory registration, not a module.
  const run = new Function('window', 'document', source)
  run(window, doc)
  assert.ok(registration !== undefined, 'the bundle must register itself with __ModuleLoader__')
  return { registration, doc, hooks, module: registration.factory(requireStub) }
}

/**
 * Build a translator over the dictionaries the plugin registered.
 * @param dictionaries - the registered `{ zh, en }` pair.
 * @returns an interpolating translator.
 */
function translatorFor(dictionaries) {
  const dict = dictionaries.en
  return (key, params) => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
  }
}

/**
 * Expand nested function components into their elements, the way a renderer
 * would. Only hook-free helpers (`Row`, `WalletIcon`) are expanded; the
 * hook-bearing pill is always passed in already rendered.
 * @param node - React-element-shaped node.
 * @returns the expanded tree.
 */
function expandTree(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(expandTree)
  if (typeof node.type === 'function') return expandTree(node.type(node.props))
  return { type: node.type, props: node.props, children: (node.children ?? []).map(expandTree) }
}

/**
 * Depth-first search for the first element matching a predicate.
 * @param node - React-element-shaped node.
 * @param predicate - test over an element.
 * @returns the matching element, or undefined.
 */
function findElement(node, predicate) {
  if (node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, predicate)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (predicate(node)) return node
  return findElement(node.children, predicate)
}

/**
 * Collect the text content of a rendered tree, expanding nested components.
 * @param node - React-element-shaped node.
 * @returns concatenated text.
 */
function textOf(node) {
  const expanded = expandTree(node)
  if (expanded === null || expanded === undefined || typeof expanded === 'boolean') return ''
  if (typeof expanded === 'string' || typeof expanded === 'number') return String(expanded)
  if (Array.isArray(expanded)) return expanded.map(textOf).join('')
  return textOf(expanded.children)
}

/**
 * One ready host payload.
 * @param overrides - fields to replace.
 * @returns the payload.
 */
function readyPayload(overrides = {}) {
  return {
    ok: true,
    isAvailable: true,
    balances: [{ currency: 'CNY', total: '47.49', granted: '0.00', toppedUp: '47.49' }],
    credentialSource: 'file',
    baseURL: 'https://api.deepseek.com',
    fetchedAt: '2026-09-12T07:43:03.687Z',
    ...overrides,
  }
}

console.log('dsh-deepseek-balance client self-test')

const first = loadBundle()
const { registration, module, doc, hooks } = first

/**
 * Render the captured component with specific hook-state overrides.
 *
 * The component closes over the React stub of the bundle that produced it, so
 * overrides must land on that same bundle's hooks object.
 * @param overrides - replacement state values, by `useState` call index.
 * @returns the rendered element tree.
 */
function renderWith(overrides) {
  hooks.overrides = overrides
  return hooks.render(component, { t })
}

await check('registers under its own package name', () => {
  assert.equal(registration.id, 'dsh-deepseek-balance')
})

await check('exports the Cordis plugin face', () => {
  assert.equal(typeof module.apply, 'function')
  assert.deepEqual(module.inject, ['slots', 'locale'])
})

await check('injects its stylesheet at materialization', () => {
  assert.equal(doc.styles.length, 1)
  assert.equal(doc.styles[0].dataset.pluginCss, 'dsh-deepseek-balance/BalancePill.module.css')
  assert.match(doc.styles[0].textContent, /\.dsb_pill\{/)
})

await check('resolves only the react shell module', () => {
  // The require stub accepts `react` alone, so reaching the module face proves
  // the bundle no longer drags in react-dom for a portal it does not need.
  assert.deepEqual(module.inject, ['slots', 'locale'])
})

let component
let dicts
await check('registers the dock entry and both dictionaries', () => {
  const registered = []
  const dictionaries = []
  const ctx = {
    effect: (body) => {
      body()
      return () => {}
    },
    locale: {
      register(namespace, value) {
        dictionaries.push({ namespace, value })
        return () => {}
      },
    },
    slots: {
      inject(key, callback) {
        assert.equal(key, 'conversation.composer.dock')
        callback()
        return () => {}
      },
      register(options, entry) {
        registered.push({ options, entry })
        return () => {}
      },
    },
  }
  module.apply(ctx)
  assert.equal(dictionaries.length, 1)
  assert.equal(dictionaries[0].namespace, 'deepseekBalance')
  assert.deepEqual(Object.keys(dictionaries[0].value.zh).sort(), Object.keys(dictionaries[0].value.en).sort())
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.name, 'conversation.composer.dock')
  assert.equal(registered[0].options.id, 'deepseek-balance')
  assert.equal(registered[0].options.locale, 'deepseekBalance')
  assert.ok(Number.isFinite(registered[0].options.order), 'a list entry needs a sortable order')
  assert.equal(typeof registered[0].entry, 'function')
  component = registered[0].entry
  dicts = dictionaries[0].value
})

const t = translatorFor(dicts)

await check('paces the next poll from the host interval', async () => {
  const realTimeout = globalThis.setTimeout
  const delays = []
  const originalFetch = globalThis.fetch
  globalThis.setTimeout = function (fn, delay, ...rest) {
    delays.push(delay)
    return realTimeout.call(this, fn, delay, ...rest)
  }
  globalThis.fetch = async () => new Response(JSON.stringify(readyPayload({ pollMs: 2500 })), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    renderWith([])
    const cleanup = hooks.effects[0]()
    await new Promise((resolve) => realTimeout(resolve, 20))
    assert.ok(delays.includes(2500), `expected a 2500ms poll, got ${JSON.stringify(delays)}`)
    cleanup()
  } finally {
    globalThis.setTimeout = realTimeout
    globalThis.fetch = originalFetch
  }
})

await check('falls back to 10s when the host reports no interval', async () => {
  const realTimeout = globalThis.setTimeout
  const delays = []
  const originalFetch = globalThis.fetch
  globalThis.setTimeout = function (fn, delay, ...rest) {
    delays.push(delay)
    return realTimeout.call(this, fn, delay, ...rest)
  }
  globalThis.fetch = async () => new Response(JSON.stringify(readyPayload()), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    renderWith([])
    const cleanup = hooks.effects[0]()
    await new Promise((resolve) => realTimeout(resolve, 20))
    assert.ok(delays.includes(10000), `expected the 10s default, got ${JSON.stringify(delays)}`)
    cleanup()
  } finally {
    globalThis.setTimeout = realTimeout
    globalThis.fetch = originalFetch
  }
})

await check('forces a refresh once the payload is older than the interval', async () => {
  const realTimeout = globalThis.setTimeout
  const callbacks = []
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.setTimeout = (fn) => {
    callbacks.push(fn)
    return 0
  }
  globalThis.fetch = async (url) => {
    calls.push(url)
    // A year-old instant, so the second tick must find the payload stale.
    return new Response(JSON.stringify(readyPayload({ pollMs: 10000, fetchedAt: '2025-01-01T00:00:00.000Z' })), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    renderWith([])
    const cleanup = hooks.effects[0]()
    await new Promise((resolve) => realTimeout(resolve, 20))
    assert.equal(calls[0], '/api/deepseek-balance', 'the first read may take the host cache')
    assert.ok(callbacks.length >= 1, 'the first read must schedule the next')
    await callbacks.shift()()
    await new Promise((resolve) => realTimeout(resolve, 20))
    assert.equal(calls[1], '/api/deepseek-balance?refresh=1', 'a stale payload must force the next read')
    cleanup()
  } finally {
    globalThis.setTimeout = realTimeout
    globalThis.fetch = originalFetch
  }
})

await check('renders the pill as one inline dock item', () => {
  const tree = hooks.render(component, { t })
  assert.equal(tree.type, 'span', 'the dock item must be the anchor itself, not a wrapping row')
  assert.equal(tree.props.className, 'dsb_anchor')
  assert.equal(tree.props['data-composer-balance'], true)
  assert.match(textOf(tree), /Balance …/)
  const button = findElement(tree, (node) => node.type === 'button')
  assert.equal(button.props['aria-haspopup'], 'dialog')
  assert.equal(button.props['aria-expanded'], false)
  assert.equal(button.props.className, 'dsb_pill', 'the pill must carry its scoped class')
})

await check('renders nothing while the host half is unmounted', () => {
  assert.equal(renderWith([{ status: 'absent' }]), null)
})

await check('fetches the host route and adopts a ready payload', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(readyPayload()), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    renderWith([])
    const cleanup = hooks.effects[0]()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/deepseek-balance')
    assert.equal(calls[0].init.headers.accept, 'application/json')
    const adopted = hooks.setters.filter((entry) => entry.index === 0).at(-1)
    assert.equal(adopted.value.status, 'ready')
    assert.equal(adopted.value.payload.balances[0].total, '47.49')
    cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

await check('treats a 404 as an unmounted host half', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('not found', { status: 404 })
  try {
    renderWith([])
    const cleanup = hooks.effects[0]()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const adopted = hooks.setters.filter((entry) => entry.index === 0).at(-1)
    assert.equal(adopted.value.status, 'absent')
    cleanup()
  } finally {
    globalThis.fetch = originalFetch
  }
})

await check('renders the balance amount for a ready payload', () => {
  const tree = renderWith([{ status: 'ready', payload: readyPayload() }])
  assert.match(textOf(tree), /Balance ¥47\.49/)
  const button = findElement(tree, (node) => node.type === 'button')
  assert.equal(button.props.className.includes('dsb_warn'), false, 'a healthy balance must not warn')
})

await check('prefers the warning tone below ten', () => {
  const tree = renderWith([{
    status: 'ready',
    payload: readyPayload({ balances: [{ currency: 'CNY', total: '4.20', granted: '0.00', toppedUp: '4.20' }] }),
  }])
  assert.match(findElement(tree, (node) => node.type === 'button').props.className, /dsb_warn/)
})

await check('reports an unusable account in the error tone', () => {
  const tree = renderWith([{ status: 'ready', payload: readyPayload({ isAvailable: false }) }])
  assert.match(textOf(tree), /Balance unavailable/)
  assert.match(findElement(tree, (node) => node.type === 'button').props.className, /dsb_error/)
})

await check('surfaces a host error with its reason', () => {
  const tree = renderWith([{ status: 'error', code: 'MISSING_CREDENTIAL', message: 'no value for DEEPSEEK_API_KEY' }])
  assert.match(textOf(tree), /Balance —/)
  const button = findElement(tree, (node) => node.type === 'button')
  assert.equal(button.props.className.includes('dsb_error'), true)
  assert.equal(button.props.title, 'no value for DEEPSEEK_API_KEY')
})

await check('opens a dialog listing every balance bucket', () => {
  const tree = renderWith([{
    status: 'ready',
    payload: readyPayload({
      balances: [
        { currency: 'CNY', total: '47.49', granted: '0.00', toppedUp: '47.49' },
        { currency: 'USD', total: '6.00', granted: '1.00', toppedUp: '5.00' },
      ],
    }),
  }, true])
  const dialog = findElement(tree, (node) => node.props?.role === 'dialog')
  assert.ok(dialog !== undefined, 'an open pill must render a dialog')
  assert.equal(dialog.props.className, 'dsb_panel')
  const text = textOf(dialog)
  for (const expected of ['DeepSeek balance', 'CNY', 'USD', '¥47.49', '$6.00', 'Refresh', 'Updated', 'Credential source']) {
    assert.ok(text.includes(expected), `the dialog should show ${JSON.stringify(expected)}; got: ${text}`)
  }
})

await check('arms and releases the dismiss listeners while open', () => {
  renderWith([{ status: 'ready', payload: readyPayload() }, true])
  const cleanup = hooks.effects[1]()
  assert.equal(doc.listeners.length, 2, 'mousedown and keydown must be armed')
  assert.equal(typeof cleanup, 'function')
  cleanup()
  assert.equal(doc.listeners.length, 0, 'closing must release both listeners')
})

await check('never claims the dock row width', () => {
  // Regression guard for the pre-0.1.6-alpha.2 layout: the dock
  // (`InputBar.module.css .dock`) lays the host's statistics pills, this pill,
  // and ContextMeter out on one centered flex line. A wrapper with
  // `width:100%` makes the balance pill the widest item on that line, which
  // shrinks every sibling and ellipsizes the host's own figures. The pill must
  // therefore stay a content-sized inline-flex item.
  const styleText = doc.styles[0].textContent
  assert.equal(/\.dsb_root\{/.test(styleText), false, 'the full-width row wrapper must be gone')
  assert.equal(styleText.includes('data-composer-stats'), false)
  const anchorRule = /\.dsb_anchor\{([^}]*)\}/.exec(styleText)
  assert.ok(anchorRule !== null, 'the anchor rule must exist')
  const declarations = anchorRule[1].split(';').map((part) => part.trim()).filter((part) => part !== '')
  assert.equal(
    declarations.some((part) => /^width\s*:\s*100%$/.test(part)),
    false,
    'the anchor must not stretch to the row width',
  )
  assert.equal(declarations.includes('min-width:0'), true)
  assert.match(anchorRule[1], /max-width:100%/)
  assert.match(anchorRule[1], /display:inline-flex/)

  for (const state of [
    { status: 'loading' },
    { status: 'ready', payload: readyPayload() },
    { status: 'error', code: 'NETWORK', message: 'offline' },
  ]) {
    const tree = renderWith([state, false])
    const wrappers = []
    const collect = (node) => {
      if (node === null || typeof node !== 'object') return
      if (Array.isArray(node)) {
        for (const child of node) collect(child)
        return
      }
      if (typeof node.type !== 'function') wrappers.push(node)
      collect(node.children)
    }
    collect(tree)
    assert.ok(
      wrappers.some((node) => node.props?.['data-composer-balance'] === true),
      'every state must render the bare anchor as the dock item',
    )
    assert.equal(
      wrappers.some((node) => node.props?.['data-composer-balance-row'] === true),
      false,
      'no state may wrap the pill in its own row',
    )
  }
})

await check('carries the host pill type ramp', () => {
  // The dock's own pills get their type from `StatsPills.module.css`
  // `.root`/`.pill` and `ContextMeter.module.css` `.trigger`:
  // `font-size: var(--dsh-content-font-size-secondary, 13px)` with
  // `line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px))`.
  // The anchor is a direct dock child like those roots, so it must declare the
  // same ramp; otherwise `font: inherit` picks up the composer's 14px base and
  // the balance reads visibly larger than its neighbours.
  const styleText = doc.styles[0].textContent
  const anchorRule = /\.dsb_anchor\{([^}]*)\}/.exec(styleText)
  assert.ok(anchorRule !== null, 'the anchor rule must exist')
  assert.match(anchorRule[1], /font-size:var\(--dsh-content-font-size-secondary,13px\)/)
  assert.match(
    anchorRule[1],
    /line-height:calc\(20px \+ var\(--dsh-content-font-delta-secondary,0px\)\)/,
  )
  assert.equal(
    /\.dsb_pill\{[^}]*font-size:/.test(styleText),
    false,
    'the pill must inherit the anchor ramp through `font: inherit`',
  )
})

await check('stops watching the DOM for a portal target', () => {
  // The old host row carried `[data-composer-stats]`; the new dock exposes no
  // selector, and the slot renders this component directly. A surviving
  // 500ms interval would only cost work.
  const intervals = []
  const realSetInterval = globalThis.setInterval
  const realFetch = globalThis.fetch
  const cleanups = []
  globalThis.setInterval = (...args) => {
    intervals.push(args)
    return 0
  }
  globalThis.fetch = async () => new Response('not found', { status: 404 })
  try {
    renderWith([])
    for (const effect of hooks.effects) {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    }
    assert.equal(intervals.length, 0, 'the bundle must not poll the DOM')
  } finally {
    globalThis.setInterval = realSetInterval
    globalThis.fetch = realFetch
    for (const cleanup of cleanups) cleanup()
  }
})

console.log(results.join('\n'))
console.log(process.exitCode === 1 ? '\nFAILED' : '\nall checks passed')
