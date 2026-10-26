import { expect, mock, test } from 'claude-code/testing'

const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-3'
const simctl = (bState: string) => JSON.stringify({
  devices: {
    [RUNTIME]: [
      { udid: 'AAAA', name: 'iPhone 17', state: 'Shutdown', isAvailable: true },
      { udid: 'BBBB', name: 'iPhone 17 Pro', state: bState, isAvailable: true },
      { udid: 'CCCC', name: 'iPad (A16)', state: 'Shutdown', isAvailable: true },
    ],
  },
})

const SIMCTL = simctl('Booted')
const PANE = 'emu'
const VIEWPORT = { columns: 120, rows: 40, isFullscreen: true }

const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

/** Loads the plugin against a fake simctl (no Android SDK) and mounts the pane. */
const setup = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], viewport = VIEWPORT) => {
  const commands: string[][] = []
  const sim = { json: SIMCTL }
  mock.env(on, { HOME: '/nowhere' })
  const clock = mock.clock(on)
  on('process.run', async (_$, e) => {
    commands.push([...e.argv])
    if (e.argv[0] === 'test') return { value: { ...ok(), exitCode: 1 } }
    if (e.argv.includes('list')) return { value: ok(sim.json) }
    return { value: ok() }
  })
  on('ui.focus', async () => {
    return {}
  })
  on('ui.status', async () => ({ value: undefined }))
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const ui = await $.ui.mount({ plugin: 'emu', surface: 'terminal', component: 'Pane', props: {}, requestId: PANE, viewport })
  // The refresh button reads the fake simctl into the state the pane draws (BBBB stays booted).
  await ui.press({ key: 'refresh' })
  commands.length = 0
  return { ui, commands, sim, clock, toasts }
}

const rowsOf = async (ui: { findAll: (q: { type: 'Button' }) => Promise<{ key?: string; text: string }[]> }) =>
  (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row-'))

const focusRow = ($: Parameters<Parameters<typeof test>[1]>[0], id: string) =>
  $.ui.focus({ component: 'Pane', requestId: PANE, plugin: 'emu', element: `row-${id}`, origin: { kind: 'person' } })

test('pane lists numbered rows, running first, and marks the focus ring', async ($, on) => {
  const { ui } = await setup($, on)
  const rows = await rowsOf(ui)
  const keys = rows.map(r => r.key)
  expect(keys).toEqual(['row-BBBB', 'row-AAAA', 'row-CCCC'])
  expect(rows[0].text).toContain('1')
  expect(rows[2].text).toContain('3')

  await focusRow($, 'AAAA')
  const after = await rowsOf(ui)
  expect(after[1].text).toContain('▶')
  expect(after[0].text).not.toContain('▶')
})

test('enter on a row boots a stopped device and stops a running one', async ($, on) => {
  const { ui, commands } = await setup($, on)
  await ui.press({ key: 'row-AAAA' })
  expect(commands.some(c => c.join(' ') === 'xcrun simctl boot AAAA')).toBe(true)
  await ui.press({ key: 'row-BBBB' })
  expect(commands.some(c => c.join(' ') === 'xcrun simctl shutdown BBBB')).toBe(true)
})

test('a narrow pane drops the runtime column and the hint, never the name', async ($, on) => {
  const { ui } = await setup($, on, { ...VIEWPORT, columns: 30 })
  const rows = await rowsOf(ui)
  expect(rows[0].text).toContain('iPhone 17 Pro')
})

test('a device stopped outside the plugin shows as stopped after a refresh', async ($, on) => {
  const { ui, sim } = await setup($, on)
  expect((await rowsOf(ui))[0].text).toContain('⏎ Stop')
  sim.json = simctl('Shutdown')
  await ui.press({ key: 'refresh' })
  const first = (await rowsOf(ui))[0]
  expect(first.text).toContain('⏎ Boot')
})

test('stop-all needs a second press of x', async ($, on) => {
  const { ui, commands } = await setup($, on)
  await ui.press({ key: 'stop-all' })
  expect(commands.some(c => c.includes('shutdown'))).toBe(false)
  const [button] = (await ui.findAll({ type: 'Button' })).filter(b => b.key === 'stop-all')
  expect(button.text).toContain('press again')
  await ui.press({ key: 'stop-all' })
  expect(commands.some(c => c.join(' ') === 'xcrun simctl shutdown BBBB')).toBe(true)
})

test('a result line shows after a boot and clears itself', async ($, on) => {
  const { ui, clock } = await setup($, on)
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const before = (await texts()).length
  await ui.press({ key: 'row-AAAA' })
  expect((await texts()).length).toBeGreaterThan(before)
  await clock.advance(5_001)
  expect((await texts()).length).toBe(before)
})

test('an AVD that cannot boot shows its reason, is hidden when collapsed and is never started', async ($, on) => {
  const sdk = '/sdk'
  const commands: string[][] = []
  mock.env(on, { HOME: '/home', ANDROID_HOME: sdk })
  mock.clock(on)
  const avdIni = (abi: string, dir: string) => `abi.type=${abi}\nimage.sysdir.1=${dir}`
  on('process.run', async (_$, e) => {
    const [cmd, a1] = e.argv
    commands.push([...e.argv])
    if (cmd === 'test') return { value: { ...ok(), exitCode: a1 === '-x' || e.argv[2] === `${sdk}/system-images/ok/` ? 0 : 1 } }
    if (cmd === 'uname') return { value: ok('arm64\n') }
    if (a1 === '-list-avds') return { value: ok('Good\nGone\nIntel\n') }
    if (cmd === 'cat' && a1?.endsWith('Good.ini')) return { value: ok('path=/avd/Good.avd') }
    if (cmd === 'cat' && a1?.endsWith('Gone.ini')) return { value: ok('path=/avd/Gone.avd') }
    if (cmd === 'cat' && a1?.endsWith('Intel.ini')) return { value: ok('path=/avd/Intel.avd') }
    if (cmd === 'cat' && a1 === '/avd/Good.avd/config.ini') return { value: ok(avdIni('arm64-v8a', 'system-images/ok/')) }
    if (cmd === 'cat' && a1 === '/avd/Gone.avd/config.ini') return { value: ok(avdIni('arm64-v8a', 'system-images/android-29/google_apis/arm64-v8a/')) }
    if (cmd === 'cat' && a1 === '/avd/Intel.avd/config.ini') return { value: ok(avdIni('x86_64', 'system-images/android-35/google_apis/x86_64/')) }
    if (e.argv.includes('list')) return { value: ok('{"devices":{}}') }
    return { value: ok() }
  })
  on('ui.focus', async () => ({}))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'emu', surface: 'terminal', component: 'Pane', props: {}, requestId: PANE, viewport: VIEWPORT })
  await ui.press({ key: 'refresh' })

  expect((await rowsOf(ui)).map(r => r.key)).toEqual(['row-Good'])
  await ui.press({ key: 'expand' })
  const rows = await rowsOf(ui)
  expect(rows.map(r => r.key)).toEqual(['row-Good', 'row-Gone', 'row-Intel'])
  expect(rows[1].text).toContain('✕ no image')
  expect(rows[2].text).toContain('✕ no arch')

  commands.length = 0
  await ui.press({ key: 'row-Gone' })
  expect(commands.some(c => c.join(' ').includes('-avd'))).toBe(false)
})

test('the footer offers h and l only while both lists show', async ($, on) => {
  const sdk = '/sdk'
  mock.env(on, { HOME: '/home', ANDROID_HOME: sdk })
  mock.clock(on)
  on('process.run', async (_$, e) => {
    const [cmd, a1] = e.argv
    if (cmd === 'test') return { value: { ...ok(), exitCode: a1 === '-x' ? 0 : 1 } }
    if (cmd === 'uname') return { value: ok('arm64\n') }
    if (a1 === '-list-avds') return { value: ok('Pixel_A\nPixel_B\n') }
    if (e.argv.includes('list')) return { value: ok(SIMCTL) }
    return { value: { ...ok(), exitCode: 1 } }
  })
  on('ui.focus', async () => ({}))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  const ui = await $.ui.mount({ plugin: 'emu', surface: 'terminal', component: 'Pane', props: {}, requestId: PANE, viewport: VIEWPORT })
  await ui.press({ key: 'refresh' })

  const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(keys).toContain('jump-ios')
  expect(keys).toContain('jump-android')
})

test('a change made outside the plugin toasts only while the pane is closed', async ($, on) => {
  const open = { value: true }
  on('ui.panes', async () => ({ value: open.value ? [{ id: PANE }] : [] }))
  const { ui, sim, toasts } = await setup($, on)
  sim.json = simctl('Shutdown')
  await ui.press({ key: 'refresh' })
  expect(toasts).toEqual([])

  open.value = false
  sim.json = SIMCTL
  await ui.press({ key: 'refresh' })
  expect(toasts).toEqual(['iPhone 17 Pro is running'])
})
