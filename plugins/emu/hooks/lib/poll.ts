import type { EngineInterface } from 'claude-code'
import { IDLE_POLL_EVERY_N_TICKS, MESSAGE_CLEAR_MS, PANE_AUTO_CLOSE_MS, PANE_ID, STOP_ALL_CONFIRM_MS } from './constants'
import { formatStatus, unavailableMessage } from './devices'
import { createService } from './service'
import type { Device } from './types'

/** Toast text for devices whose running state changed between two snapshots. */
export const describeChanges = (before: readonly Device[], after: readonly Device[]): string[] => {
  const was = new Map(before.map(d => [d.id, d.isRunning]))
  return after.flatMap(d => {
    const prev = was.get(d.id)
    if (prev === undefined || prev === d.isRunning) return []
    return [`${d.name} ${d.isRunning ? 'is running' : 'stopped'}`]
  })
}

/** Whether the pane is on screen; a failing `panes()` counts as open so the rows never go stale. */
function isPaneOpen($: EngineInterface): Promise<boolean> {
  return $.ui.panes().then(list => list.some(p => p.id === PANE_ID), () => true)
}

/** A toast for when the pane is closed; an open pane already shows the row and the result line. */
async function toastUnlessPaneOpen($: EngineInterface, text: string): Promise<void> {
  if (!(await isPaneOpen($))) $.ui.toast(text)
}

let latestRefresh = 0

/** Re-reads the devices, publishes them to the pane, status line and toasts. A read that a newer one overtook is dropped, so a slow poll never puts back an older state. */
export async function refresh($: EngineInterface, { quiet = false } = {}): Promise<void> {
  const mine = ++latestRefresh
  const devices = await createService($).devices()
  if (mine !== latestRefresh) return
  const { value: before = [] } = await $.state.get({ plugin: 'emu', key: 'devices' } as const)
  const { value: busy = {} } = await $.state.get({ plugin: 'emu', key: 'busy' } as const)
  await $.state.set({ plugin: 'emu', key: 'devices' } as const, devices)
  $.ui.status(formatStatus(devices))
  if (quiet || before.length === 0) return
  // Devices this plugin is booting / stopping report their own result.
  const settled = (list: readonly Device[]) => list.filter(d => !busy[d.id])
  for (const line of describeChanges(settled(before), settled(devices))) await toastUnlessPaneOpen($, line)
}

let tick = 0

/** The timer body: full rate while the pane is open, every Nth tick otherwise. */
export async function poll($: EngineInterface): Promise<void> {
  tick += 1
  if (!(await isPaneOpen($)) && tick % IDLE_POLL_EVERY_N_TICKS !== 0) return
  await refresh($).catch(() => undefined)
}

const MESSAGE_KEY = { plugin: 'emu', key: 'message' } as const

/** Shows a result line in the pane and clears it after a while, unless a newer one replaced it. */
async function showMessage($: EngineInterface, message: string): Promise<void> {
  await $.state.set(MESSAGE_KEY, message)
  $.clock.after(MESSAGE_CLEAR_MS, async () => {
    const { value } = await $.state.get(MESSAGE_KEY)
    if (value === message) await $.state.set(MESSAGE_KEY, null)
  })
}

const BUSY_KEY = { plugin: 'emu', key: 'busy' } as const

/** Marks devices busy (`Booting` / `Stopping`). */
async function markBusy($: EngineInterface, ids: readonly string[], label: string): Promise<void> {
  const { value: busy = {} } = await $.state.get(BUSY_KEY)
  await $.state.set(BUSY_KEY, { ...busy, ...Object.fromEntries(ids.map(id => [id, label])) })
}

/** Clears the busy mark of devices. */
async function clearBusy($: EngineInterface, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  const { value: busy = {} } = await $.state.get(BUSY_KEY)
  await $.state.set(BUSY_KEY, Object.fromEntries(Object.entries(busy).filter(([id]) => !ids.includes(id))))
}

/** Boots or stops one device from the pane, marking the row busy meanwhile. */
export async function toggleDevice($: EngineInterface, d: Device): Promise<void> {
  armAutoClose($)
  const { value: held = {} } = await $.state.get(BUSY_KEY)
  if (held[d.id]) return
  const refused = unavailableMessage(d)
  if (refused) return showMessage($, refused)
  await markBusy($, [d.id], d.isRunning ? 'Stopping' : 'Booting')
  try {
    const svc = createService($)
    const message = d.isRunning ? await svc.shutdown(d.id) : await svc.boot(d.id)
    await toastUnlessPaneOpen($, message)
    await showMessage($, message)
  } finally {
    await clearBusy($, [d.id])
    await refresh($, { quiet: true })
  }
}

/** Shuts down every running device from the pane, marking each row busy meanwhile. */
export async function stopAll($: EngineInterface): Promise<void> {
  armAutoClose($)
  const { value: known = [] } = await $.state.get({ plugin: 'emu', key: 'devices' } as const)
  const { value: held = {} } = await $.state.get(BUSY_KEY)
  const ids = known.filter(d => d.isRunning && !held[d.id]).map(d => d.id)
  if (ids.length > 0) await markBusy($, ids, 'Stopping')
  try {
    const message = await createService($).shutdownAll()
    await toastUnlessPaneOpen($, message)
    await showMessage($, message)
  } finally {
    await clearBusy($, ids)
    await refresh($, { quiet: true })
  }
}

const CONFIRM_KEY = { plugin: 'emu', key: 'isConfirmingStopAll' } as const
let confirmTimer: { cancel: () => void } | undefined

/** `x`: the first press asks for confirmation, a second press within the window stops everything. */
export async function requestStopAll($: EngineInterface): Promise<void> {
  armAutoClose($)
  confirmTimer?.cancel()
  confirmTimer = undefined
  const { value: isConfirming = false } = await $.state.get(CONFIRM_KEY)
  if (isConfirming) {
    await $.state.set(CONFIRM_KEY, false)
    return stopAll($)
  }
  await $.state.set(CONFIRM_KEY, true)
  confirmTimer = $.clock.after(STOP_ALL_CONFIRM_MS, () => void $.state.set(CONFIRM_KEY, false))
}

let closeTimer: { cancel: () => void } | undefined

/** (Re)starts the countdown that closes the pane when nobody uses it. */
export function armAutoClose($: EngineInterface): void {
  closeTimer?.cancel()
  closeTimer = $.clock.after(PANE_AUTO_CLOSE_MS, () => void $.ui.close({ id: PANE_ID }).catch(() => undefined))
}

/** Closes the pane now and drops its countdown. */
export async function closePane($: EngineInterface): Promise<void> {
  closeTimer?.cancel()
  closeTimer = undefined
  await $.ui.close({ id: PANE_ID })
}

const FAILURE = /^(Failed|Cannot|Android SDK not found|No device)|did not finish|did not shut down|quit before booting|ambiguous/m

/** Whether a service result line reports a failure. */
export const isFailure = (message: string): boolean => FAILURE.test(message)
