import type { Device, Platform, Unavailable } from './types'

export type Resolved = { device: Device } | { error: string }

/** The short chip for an unavailable AVD. */
export const unavailableLabel = (u: Unavailable): string => (u.kind === 'no-image' ? 'no image' : 'no arch')

/** Why a boot was refused, with the way out; undefined for a device that can boot. */
export const unavailableMessage = (d: Device): string | undefined => {
  const u = d.unavailable
  if (!u) return undefined
  if (u.kind === 'no-image') {
    return `Cannot boot ${d.name}: system image not installed.${u.package ? ` Run: sdkmanager "${u.package}"` : ''}`
  }
  return `Cannot boot ${d.name}: its ${u.abi} image does not match this machine's CPU. Create an AVD with a matching image.`
}

const stateOf = (d: Device): string => {
  const u = d.unavailable
  if (!u) return d.isRunning ? 'running' : 'stopped'
  return u.kind === 'no-image' ? 'unavailable: system image not installed' : `unavailable: ${u.abi} image does not match host CPU`
}

export const describeDevice = (d: Device): string => {
  const state = stateOf(d)
  const extra = [d.detail, d.serial].filter(Boolean).join(', ')
  return `[${d.platform}] ${d.name}${extra ? ` (${extra})` : ''} - ${state} - id: ${d.id}`
}

export const formatDevices = (devices: readonly Device[]): string =>
  devices.length === 0 ? 'No devices found.' : orderDevices(devices).map(describeDevice).join('\n')

/**
 * Picks one device by exact id / serial / name, then by name substring.
 * Without a query, the only running device is chosen.
 */
export const resolveDevice = (devices: readonly Device[], query?: string): Resolved => {
  const q = query?.trim().toLowerCase()
  if (!q) {
    const running = devices.filter(d => d.isRunning)
    if (running.length === 1) return { device: running[0] }
    return {
      error: running.length === 0
        ? 'No running device. Specify a device to target.'
        : `${running.length} devices are running. Specify one:\n${formatDevices(running)}`,
    }
  }
  const exact = devices.filter(d => [d.id, d.serial, d.name].some(v => v?.toLowerCase() === q))
  const matches = exact.length > 0 ? exact : devices.filter(d => d.name.toLowerCase().includes(q))
  if (matches.length === 1) return { device: matches[0] }
  return {
    error: matches.length === 0
      ? `No device matches "${query}".\n${formatDevices(devices)}`
      : `"${query}" is ambiguous:\n${formatDevices(matches)}`,
  }
}

const isTablet = (d: Device): boolean => d.name.startsWith('iPad')

/** iOS first, bootable before unavailable, running first, phones before tablets, newer runtimes first, then by name: the pane's row order. */
export const orderDevices = (devices: readonly Device[]): Device[] =>
  [...devices].sort((a, b) =>
    b.platform.localeCompare(a.platform) ||
    Number(Boolean(a.unavailable)) - Number(Boolean(b.unavailable)) ||
    Number(b.isRunning) - Number(a.isRunning) ||
    Number(isTablet(a)) - Number(isTablet(b)) ||
    (b.detail ?? '').localeCompare(a.detail ?? '', undefined, { numeric: true }) ||
    a.name.localeCompare(b.name))

/** One line for the status area (the host already prefixes the plugin name), or undefined when nothing is running. */
export const formatStatus = (devices: readonly Device[]): string | undefined => {
  const running = devices.filter(d => d.isRunning)
  return running.length === 0 ? undefined : `${running.length} running · ${running.map(d => d.name).join(', ')}`
}

/** Rows the collapsed pane keeps: running and the first `limit` of each platform; unavailable AVDs are left out. */
export const collapseDevices = (ordered: readonly Device[], limit: number): Device[] => {
  const seen = { ios: 0, android: 0 }
  return ordered.filter(d => {
    if (d.unavailable) return false
    seen[d.platform] += 1
    return d.isRunning || seen[d.platform] <= limit
  })
}

/** The row key one step from the focused row, kept inside the list; undefined when the list is empty. */
export const stepFocus = (devices: readonly Device[], focused: string | null, step: number): string | undefined => {
  if (devices.length === 0) return undefined
  const at = Math.max(0, devices.findIndex(d => focused === `row-${d.id}`))
  return `row-${devices[Math.min(devices.length - 1, Math.max(0, at + step))].id}`
}

/** The row key of `platform`'s list at the focused row's position (clamped), for h / l; undefined when that list is empty or already holds the focus. */
export const jumpPlatform = (devices: readonly Device[], focused: string | null, platform: Platform): string | undefined => {
  const target = devices.filter(d => d.platform === platform)
  if (target.length === 0) return undefined
  const current = devices.find(d => focused === `row-${d.id}`) ?? devices[0]
  if (current.platform === platform) return undefined
  const position = devices.filter(d => d.platform === current.platform).indexOf(current)
  return `row-${target[Math.min(position, target.length - 1)].id}`
}

/**
 * The focus step an arrow key asks for, or undefined for any other scroll (wheel, page keys, Home / End, a plugin's own).
 * The engine scrolls a pane whose rows do not fit instead of moving the ring, so the pane turns the arrows into steps itself.
 */
export const arrowStep = (move: { by: number; origin: { kind: string }; pointer?: unknown }): number | undefined =>
  move.origin.kind === 'person' && move.pointer === undefined && Math.abs(move.by) === 1 ? move.by : undefined

/** Rows per platform that fit a pane `viewportRows` tall without scrolling (at least `min`, at most `max`). */
export const rowsThatFit = (viewportRows: number | undefined, chrome: number, max: number, min = 3): number =>
  viewportRows === undefined ? max : Math.min(max, Math.max(min, Math.floor((viewportRows - chrome) / 2)))

export type ColumnLayout = { isTwoColumn: boolean; isHintRoomy: boolean }

/**
 * Whether the iOS and Android lists (`sizes`: the width of each list's widest row) fit side by side in `usable` cells,
 * and whether both columns also have room for the focused row's action hint.
 */
export const layoutColumns = (usable: number, sizes: readonly number[], gap: number, hintWidth: number): ColumnLayout => {
  const isTwoColumn = sizes.length === 2 && sizes[0] + sizes[1] + gap <= usable
  return { isTwoColumn, isHintRoomy: isTwoColumn && sizes[0] + sizes[1] + 2 * hintWidth + gap <= usable }
}
