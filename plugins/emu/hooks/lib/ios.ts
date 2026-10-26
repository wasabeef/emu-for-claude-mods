import { IOS_BOOT_TIMEOUT_MS, SIMCTL_ALREADY_BOOTED_EXIT_CODE } from './constants'
import type { Device, Run } from './types'

type SimctlJson = {
  devices?: Record<string, { udid: string; name: string; state: string; isAvailable?: boolean }[]>
}

const runtimeLabel = (key: string): string => {
  const m = key.match(/SimRuntime\.([A-Za-z]+)-(.+)$/)
  return m ? `${m[1]} ${m[2].replaceAll('-', '.')}` : key
}

export const parseSimctl = (json: string): Device[] => {
  const parsed = JSON.parse(json) as SimctlJson
  return Object.entries(parsed.devices ?? {}).flatMap(([runtime, list]) =>
    list
      .filter(d => d.isAvailable !== false)
      .map((d): Device => ({
        platform: 'ios',
        id: d.udid,
        name: d.name,
        isRunning: d.state === 'Booted',
        detail: runtimeLabel(runtime),
      })),
  )
}

export const listIos = async (run: Run): Promise<Device[]> => {
  const r = await run(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'])
  if (r.exitCode !== 0) return []
  return parseSimctl(r.stdout)
}

export const bootIos = async (run: Run, d: Device): Promise<string> => {
  const boot = await run(['xcrun', 'simctl', 'boot', d.id])
  if (boot.exitCode !== 0 && boot.exitCode !== SIMCTL_ALREADY_BOOTED_EXIT_CODE) {
    return `Failed to boot ${d.name}: ${boot.stderr.trim()}`
  }
  await run(['open', '-a', 'Simulator'])
  const wait = await run(['xcrun', 'simctl', 'bootstatus', d.id, '-b'], IOS_BOOT_TIMEOUT_MS)
  return wait.exitCode === 0
    ? `Booted ${d.name}.`
    : `${d.name} did not finish booting: ${wait.stderr.trim()}`
}

export const shutdownIos = async (run: Run, d: Device): Promise<string> => {
  const r = await run(['xcrun', 'simctl', 'shutdown', d.id])
  return r.exitCode === 0 ? `Shut down ${d.name}.` : `Failed to shut down ${d.name}: ${r.stderr.trim()}`
}
