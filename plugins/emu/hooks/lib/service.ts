import type { EngineInterface } from 'claude-code'
import {
  SDK_MISSING_HINT,
  bootAndroid,
  listAndroid,
  resolveTools,
  shutdownAndroid,
  type AndroidTools,
  type AvdContext,
} from './android'
import {
  ANDROID_SDK_FALLBACK,
  AVD_HOME_FALLBACK,
  DEFAULT_TIMEOUT_MS,
  NOT_FOUND_EXIT_CODE,
} from './constants'
import { formatDevices, resolveDevice } from './devices'
import { bootIos, listIos, shutdownIos } from './ios'
import type { Device, Run } from './types'

function makeRun($: EngineInterface): Run {
  return async (argv, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    try {
      return await $.process.run(argv, { timeoutMs })
    } catch (error) {
      return { exitCode: NOT_FOUND_EXIT_CODE, stdout: '', stderr: String(error) }
    }
  }
}

async function findAndroidTools($: EngineInterface, run: Run): Promise<AndroidTools | undefined> {
  const home = await $.env.get('HOME')
  return resolveTools(run, [
    await $.env.get('ANDROID_HOME'),
    await $.env.get('ANDROID_SDK_ROOT'),
    home ? ANDROID_SDK_FALLBACK.replace('~', home) : undefined,
  ])
}

/** The AVD folder (as the emulator resolves it) and the host CPU; undefined when the folder cannot be told. */
async function findAvdContext($: EngineInterface, run: Run): Promise<AvdContext | undefined> {
  const [explicit, userHome, home] = await Promise.all([$.env.get('ANDROID_AVD_HOME'), $.env.get('ANDROID_USER_HOME'), $.env.get('HOME')])
  const avdHome = explicit ?? (userHome ? `${userHome}/avd` : home ? AVD_HOME_FALLBACK.replace('~', home) : undefined)
  if (!avdHome) return undefined
  return { avdHome, hostArch: (await run(['uname', '-m'])).stdout.trim() }
}

export type Service = ReturnType<typeof createService>

export function createService($: EngineInterface) {
  const run = makeRun($)

  const listAll = async (): Promise<{ devices: Device[]; android?: AndroidTools }> => {
    const android = await findAndroidTools($, run)
    const ctx = android ? await findAvdContext($, run) : undefined
    const [ios, droid] = await Promise.all([listIos(run), android ? listAndroid(run, android, ctx) : []])
    return { devices: [...ios, ...droid], android }
  }

  const withDevice = async (
    query: string | undefined,
    act: (d: Device, android?: AndroidTools) => Promise<string>,
  ): Promise<string> => {
    const { devices, android } = await listAll()
    const resolved = resolveDevice(devices, query)
    if ('error' in resolved) return resolved.error
    const { device } = resolved
    if (device.platform === 'android' && !android) return SDK_MISSING_HINT
    return act(device, android)
  }

  return {
    devices: async (): Promise<Device[]> => (await listAll()).devices,

    list: async (): Promise<string> => {
      const { devices, android } = await listAll()
      const hint = android ? '' : `\n(${SDK_MISSING_HINT})`
      return formatDevices(devices) + hint
    },

    boot: (query?: string) =>
      withDevice(query, (d, android) =>
        d.platform === 'ios' ? bootIos(run, d) : bootAndroid(run, android!, d)),

    shutdown: (query?: string) =>
      withDevice(query, (d, android) =>
        d.platform === 'ios' ? shutdownIos(run, d) : shutdownAndroid(run, android!, d)),

    shutdownAll: async (): Promise<string> => {
      const { devices, android } = await listAll()
      const running = devices.filter(d => d.isRunning)
      if (running.length === 0) return 'No running device.'
      const results = await Promise.all(running.map(d =>
        d.platform === 'ios' ? shutdownIos(run, d) : shutdownAndroid(run, android!, d)))
      return results.join('\n')
    },
  }
}
