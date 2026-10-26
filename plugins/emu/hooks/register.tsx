import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import { PANE_CHROME_ROWS, PANE_COLLAPSED_ROWS, PANE_ID, POLL_INTERVAL_MS } from './lib/constants'
import type { Device } from './lib/types'
import { arrowStep, collapseDevices, jumpPlatform, layoutColumns, orderDevices, rowsThatFit, stepFocus, unavailableLabel } from './lib/devices'
import { armAutoClose, closePane, isFailure, poll, refresh, requestStopAll, toggleDevice } from './lib/poll'
import { createService } from './lib/service'

const PANE = PANE_ID
/** Width of the longest state chip, `◐ Stopping…` */
const STATUS_WIDTH = 11
/** Blank cells between the iOS and Android columns */
const COLUMN_GAP = 2
/** Cells the pane keeps free at its right edge (scrollbar, border) so a row never wraps */
const PANE_GUTTER = 4
/** The rows the pane drew last, in order: what ↑ / ↓ walk */
let visibleDevices: Device[] = []
const devicesAtom =atom({ plugin: 'emu', key: 'devices' } as const, [])
const focusedAtom = atom({ plugin: 'emu', key: 'focused' } as const, null)
const messageAtom = atom({ plugin: 'emu', key: 'message' } as const, null)
const busyAtom = atom({ plugin: 'emu', key: 'busy' } as const, {})
const confirmAtom = atom({ plugin: 'emu', key: 'isConfirmingStopAll' } as const, false)
const expandedAtom = atom({ plugin: 'emu', key: 'isExpanded' } as const, false)

const DEVICE_SCHEMA = {
  device: {
    type: 'string',
    description: 'Device name (substring), UDID, AVD name or adb serial. Optional when exactly one device is running.',
  },
} as const

const TOOLS = [
  { name: 'devices', description: 'List iOS simulators and Android emulators with their running state.' },
  { name: 'boot', description: 'Boot an iOS simulator or Android emulator and wait until it is ready.', properties: DEVICE_SCHEMA },
  { name: 'shutdown', description: 'Shut down a running simulator or emulator.', properties: DEVICE_SCHEMA },
] as const

const USAGE = '/emu (open the pane) | /emu list | /emu boot <device> | /emu stop <device> | /emu stop-all | /emu close'

const deviceArg = (e: object): string | undefined => {
  const v = (e as { device?: unknown }).device
  return typeof v === 'string' && v ? v : undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'emu', description: 'List, boot and stop simulators and emulators; /emu pane opens the manager' })
    for (const t of TOOLS) {
      await $.tool.register({
        name: t.name,
        description: t.description,
        inputSchema: 'properties' in t ? { type: 'object', properties: t.properties } : undefined,
      })
    }
    void refresh($)
    $.clock.every(POLL_INTERVAL_MS, () => void poll($))
    return next(e)
  })

  on('command.run', { command: 'emu' }, async ($, e) => {
    const svc = createService($)
    const [sub, ...rest] = e.args.trim().split(/\s+/)
    const query = rest.join(' ') || undefined
    switch (sub) {
      case 'list':
        return { text: await svc.list() }
      case '':
      case 'pane': {
        await $.state.set({ plugin: 'emu', key: 'focused' } as const, null)
        await $.state.set({ plugin: 'emu', key: 'message' } as const, null)
        await $.state.set({ plugin: 'emu', key: 'isConfirmingStopAll' } as const, false)
        await refresh($)
        // `open({ focus })` hands the pane the keys; the ring still has to land on a row for the arrows to move it.
        const { value: known = [] } = await $.state.get({ plugin: 'emu', key: 'devices' } as const)
        const ordered = orderDevices(known)
        const first = ordered[0]
        // The arrows only walk the buttons when the content fits; a taller pane just scrolls, so ask for the full height.
        const wanted = collapseDevices(ordered, PANE_COLLAPSED_ROWS).length + PANE_CHROME_ROWS
        await $.ui.open({ id: PANE, title: 'Simulators & Emulators', focus: true, closeOnEscape: true, rows: wanted })
        armAutoClose($)
        if (first) await $.ui.focus({ requestId: PANE, key: `row-${first.id}` })
        return { text: 'Opened the emu pane.' }
      }
      case 'close':
        await closePane($)
        return { text: 'Closed the emu pane.' }
      case 'boot':
        return { text: await svc.boot(query) }
      case 'stop':
        return { text: await svc.shutdown(query) }
      case 'stop-all':
        return { text: await svc.shutdownAll() }
      case 'help':
        return { text: `Usage: ${USAGE}` }
      default:
        return { text: `Unknown subcommand "${sub}". Usage: ${USAGE}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = orderDevices(await read($, devicesAtom))
    const isExpanded = await read($, expandedAtom)
    const devices = isExpanded ? all : collapseDevices(all, rowsThatFit(e.viewport?.rows, PANE_CHROME_ROWS, PANE_COLLAPSED_ROWS))
    visibleDevices = devices
    const hiddenCount = all.length - devices.length
    const busy = await read($, busyAtom)
    const focused = await read($, focusedAtom)
    const message = await read($, messageAtom)
    const firstId = devices[0]?.id
    const runningCount = all.filter(d => d.isRunning).length

    // The arrows do not move the ring in a pane (Tab does), so j / k move it by hand.
    // A press reads the ring and the rows when it fires, not what this draw captured: it may be several presses behind.
    // The ring's row is recorded here as well as in the `ui.focus` hook, so a press never depends on that event's shape.
    const focusKey = async (key: string | undefined) => {
      if (!key) return
      const result = await $.ui.focus({ requestId: PANE, key })
      if (!result.deny) await update($, focusedAtom, () => key)
    }
    const move = async (step: number) => focusKey(stepFocus(visibleDevices, await read($, focusedAtom), step))
    // h / l hop to the iOS / Android list (the arrows left and right belong to Claude Code, not to the pane).
    const jump = async (platform: 'ios' | 'android') => focusKey(jumpPlatform(visibleDevices, await read($, focusedAtom), platform))
    const isConfirming = await read($, confirmAtom)
    const numberWidth = String(devices.length).length
    const detailOf = (d: (typeof devices)[number]) =>
      d.serial && d.isRunning ? `${d.detail ?? ''} ${d.serial}`.trim() : d.detail ?? ''
    const columns = e.viewport?.columns ?? Number.POSITIVE_INFINITY
    // Column widths for a set of rows: the longest name and runtime text in it.
    const measure = (rows: typeof devices) => {
      const nameWidth = Math.max(0, ...rows.map(d => d.name.length))
      const detailWidth = Math.max(0, ...rows.map(d => detailOf(d).length))
      return { nameWidth, detailWidth, fixedWidth: 2 + numberWidth + 1 + nameWidth + 1 + STATUS_WIDTH }
    }
    const platforms = (['ios', 'android'] as const).filter(p => all.some(d => d.platform === p))
    // Side by side when both platforms' rows (runtime column included) fit next to each other; each column is as wide as its rows.
    const usable = columns - PANE_GUTTER
    const sized = platforms.map(p => {
      const m = measure(devices.filter(d => d.platform === p))
      return m.fixedWidth + 1 + m.detailWidth + 1
    })
    const { isTwoColumn } = layoutColumns(usable, sized, COLUMN_GAP, 0)
    const shared = measure(devices)

    const renderGroup = (platform: 'ios' | 'android') => {
      const rows = devices.filter(d => d.platform === platform)
      const total = all.filter(d => d.platform === platform)
      // Unavailable AVDs the collapsed list leaves out come back as one line.
      const hiddenUnavailable = total.filter(d => d.unavailable && !devices.includes(d)).length
      const { nameWidth, detailWidth, fixedWidth } = isTwoColumn ? measure(rows) : shared
      const width = usable
      // Drop the runtime column when there is no room for the full row.
      const showDetail = isTwoColumn || width >= fixedWidth + 1 + detailWidth + 1
      return (
        <Box key={`group-${platform}`} flexDirection="column" marginTop={1} width={isTwoColumn ? sized[platforms.indexOf(platform)] : undefined}>
          <Text wrap="truncate-end">
            <Text bold color={platform === 'ios' ? 'blue' : 'green'}>{platform === 'ios' ? 'iOS Simulators' : 'Android Emulators'}</Text>
            <Text dimColor>{`  ${total.filter(d => d.isRunning).length}/${total.length} running`}</Text>
          </Text>
          {rows.map(d => {
            const isFocused = focused === `row-${d.id}` || (focused === null && d.id === firstId)
            const number = String(devices.indexOf(d) + 1).padStart(numberWidth)
            const detail = detailOf(d).padEnd(detailWidth)
            const action = d.isRunning ? 'Stop' : 'Boot'
            const isUnavailable = Boolean(d.unavailable)
            return (
              <Button key={`row-${d.id}`} plain onPress={() => toggleDevice($, d)}>
                <Text color={isFocused ? 'cyan' : undefined} bold={isFocused}>{isFocused ? '▶ ' : '  '}</Text>
                <Text dimColor>{`${number} `}</Text>
                <Text color={isFocused ? 'cyan' : undefined} bold={isFocused} dimColor={isUnavailable && !isFocused}>{d.name.padEnd(nameWidth)}</Text>
                {showDetail ? <Text dimColor>{` ${detail} `}</Text> : <Text> </Text>}
                {busy[d.id]
                  ? <Text color="yellow">{`◐ ${busy[d.id]}…`}</Text>
                  : d.unavailable
                    ? <Text color={isFocused ? 'cyan' : undefined} bold={isFocused} dimColor={!isFocused}>{`✕ ${unavailableLabel(d.unavailable)}`}</Text>
                  : isFocused
                    ? <Text color="cyan" bold>{`${d.isRunning ? '●' : '○'} ⏎ ${action}`}</Text>
                    : <Text color={d.isRunning ? 'green' : undefined} dimColor={!d.isRunning}>{d.isRunning ? '● running' : '○ stopped'}</Text>}
              </Button>
            )
          })}
          {hiddenUnavailable > 0 && <Text dimColor>{`  ✕ ${hiddenUnavailable} unavailable (a: show)`}</Text>}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          {all.length === 0 ? 'No devices found (needs Xcode Command Line Tools or the Android SDK)' : `${runningCount} running · ${all.length} devices`}
          {' · tab / j k move · enter boot/stop · esc close'}
          {e.viewport?.isFullscreen === false ? ' · clicks need the fullscreen layout' : ''}
        </Text>
        <Box flexDirection={isTwoColumn ? 'row' : 'column'} columnGap={isTwoColumn ? COLUMN_GAP : undefined}>
          {platforms.map(renderGroup)}
        </Box>
        <Box marginTop={1}>
          {devices.some(d => d.platform === 'ios') && devices.some(d => d.platform === 'android') && (
            <>
              <Button key="jump-ios" hotkey="h" label="h: iOS" dimColor onPress={() => jump('ios')} />
              <Text> </Text>
              <Button key="jump-android" hotkey="l" label="l: Android" dimColor onPress={() => jump('android')} />
              <Text> </Text>
            </>
          )}
          <Button key="move-down" hotkey="j" label="j: down" dimColor onPress={() => move(1)} />
          <Text> </Text>
          <Button key="move-up" hotkey="k" label="k: up" dimColor onPress={() => move(-1)} />
          <Text> </Text>
          <Button
            key="expand"
            hotkey="a"
            label={isExpanded ? 'a: fewer' : `a: all (+${hiddenCount})`}
            dimColor
            onPress={() => { armAutoClose($); return update($, expandedAtom, v => !v) }}
          />
          <Text> </Text>
          {runningCount > 0 && (
            <Button
              key="stop-all"
              hotkey="x"
              label={isConfirming ? `x: press again to stop ${runningCount}` : `x: stop all (${runningCount})`}
              dimColor={!isConfirming}
              variant={isConfirming ? 'primary' : undefined}
              onPress={() => requestStopAll($)}
            />
          )}
          {runningCount > 0 && <Text> </Text>}
          <Button key="refresh" hotkey="r" label="r: refresh" dimColor onPress={() => { armAutoClose($); return refresh($) }} />
          <Text> </Text>
          <Button key="close" hotkey="c" label="c: close" dimColor onPress={() => closePane($)} />
        </Box>
        {message ? <Text wrap="truncate-end" color={isFailure(message) ? 'red' : undefined} dimColor={!isFailure(message)}>{message}</Text> : null}
      </Box>
    )
  })

  // ↑ / ↓ move the ring even when the rows overflow the pane (expanded list), where the engine would scroll instead.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const step = arrowStep(e)
    if (step === undefined || visibleDevices.length === 0) return next(e)
    armAutoClose($)
    const key = stepFocus(visibleDevices, await read($, focusedAtom), step)
    if (key) {
      const result = await $.ui.focus({ requestId: PANE, key })
      if (!result.deny) await update($, focusedAtom, () => key)
    }
    return {}
  })

  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    armAutoClose($)
    const result = await next(e)
    // Record the stop only once the ring has really moved there.
    if (!result.deny) await update($, focusedAtom, () => e.element ?? null)
    return result
  })

  on('tool.call', { tool: 'mcp__emu__devices' }, async $ => ({ result: await createService($).list() }))

  on('tool.call', { tool: 'mcp__emu__boot' }, async ($, e) => ({ result: await createService($).boot(deviceArg(e)) }))

  on('tool.call', { tool: 'mcp__emu__shutdown' }, async ($, e) => ({ result: await createService($).shutdown(deviceArg(e)) }))
}
