import { ANDROID_BOOT_TIMEOUT_MS, ANDROID_POLL_INTERVAL_SEC, ANDROID_SHUTDOWN_TIMEOUT_MS, BOOT_LOG_DIR } from './constants'
import { unavailableMessage } from './devices'
import type { Device, Run, Unavailable } from './types'

export type AndroidTools = { adb: string; emulator: string }

export const SDK_MISSING_HINT =
  'Android SDK not found. Set ANDROID_HOME (needs platform-tools/adb and emulator/emulator).'

const isExecutable = async (run: Run, path: string): Promise<boolean> =>
  (await run(['test', '-x', path])).exitCode === 0

/** Returns the tools of the first SDK root that holds both adb and emulator. */
export const resolveTools = async (
  run: Run,
  roots: readonly (string | undefined)[],
): Promise<AndroidTools | undefined> => {
  for (const root of roots) {
    if (!root) continue
    const tools = { adb: `${root}/platform-tools/adb`, emulator: `${root}/emulator/emulator` }
    if ((await isExecutable(run, tools.adb)) && (await isExecutable(run, tools.emulator))) return tools
  }
  return undefined
}

const lines = (text: string): string[] =>
  text.split('\n').map(l => l.trim()).filter(Boolean)

/** Serials of attached emulators from `adb devices` output. */
export const parseAdbEmulators = (output: string): string[] =>
  lines(output)
    .map(l => l.split(/\s+/))
    .filter(([serial, state]) => serial.startsWith('emulator-') && state === 'device')
    .map(([serial]) => serial)

/** First line of `adb emu avd name`, which is followed by an "OK" line. */
export const parseAvdName = (output: string): string | undefined => lines(output)[0]

const serialsByAvd = async (run: Run, t: AndroidTools): Promise<Map<string, string>> => {
  const attached = await run([t.adb, 'devices'])
  const map = new Map<string, string>()
  for (const serial of parseAdbEmulators(attached.stdout)) {
    const r = await run([t.adb, '-s', serial, 'emu', 'avd', 'name'])
    const name = parseAvdName(r.stdout)
    if (r.exitCode === 0 && name) map.set(name, serial)
  }
  return map
}

/** Where AVDs live and what CPU this machine has: what it takes to tell an AVD that cannot boot. */
export type AvdContext = { avdHome: string; hostArch: string }

/** Value of `key=` in the text of an .ini file. */
export const parseIniValue = (text: string, key: string): string | undefined => {
  for (const l of lines(text)) {
    const at = l.indexOf('=')
    if (at > 0 && l.slice(0, at).trim() === key) return l.slice(at + 1).trim()
  }
  return undefined
}

/** Whether an AVD built for `abi` can run on a host whose `uname -m` is `hostArch`. */
export const isAbiRunnable = (abi: string, hostArch: string): boolean => {
  if (hostArch === 'arm64' || hostArch === 'aarch64') return abi.startsWith('arm64')
  if (hostArch === 'x86_64') return abi.startsWith('x86')
  return true
}

/** The sdkmanager package of an image dir such as `system-images/android-35/google_apis/arm64-v8a/`. */
export const imagePackage = (sysdir: string): string | undefined =>
  sysdir.startsWith('system-images/') ? sysdir.split('/').filter(Boolean).join(';') : undefined

const sdkRootOf = (t: AndroidTools): string => t.emulator.replace(/\/emulator\/emulator$/, '')

/** Reads an AVD's config: its CPU against the host's, then whether its system image is installed. Unreadable config counts as bootable. */
const checkAvd = async (run: Run, t: AndroidTools, ctx: AvdContext, name: string): Promise<Unavailable | undefined> => {
  const ini = await run(['cat', `${ctx.avdHome}/${name}.ini`])
  const dir = (ini.exitCode === 0 ? parseIniValue(ini.stdout, 'path') : undefined) ?? `${ctx.avdHome}/${name}.avd`
  const config = await run(['cat', `${dir}/config.ini`])
  if (config.exitCode !== 0) return undefined
  const abi = parseIniValue(config.stdout, 'abi.type')
  if (abi && !isAbiRunnable(abi, ctx.hostArch)) return { kind: 'no-arch', abi }
  const sysdir = parseIniValue(config.stdout, 'image.sysdir.1')
  if (!sysdir) return undefined
  const installed = await run(['test', '-d', sysdir.startsWith('/') ? sysdir : `${sdkRootOf(t)}/${sysdir}`])
  return installed.exitCode === 0 ? undefined : { kind: 'no-image', package: imagePackage(sysdir) }
}

export const listAndroid = async (run: Run, t: AndroidTools, ctx?: AvdContext): Promise<Device[]> => {
  const avds = await run([t.emulator, '-list-avds'])
  if (avds.exitCode !== 0) return []
  const running = await serialsByAvd(run, t)
  const names = lines(avds.stdout)
  const unavailable = await Promise.all(names.map(name => (ctx ? checkAvd(run, t, ctx, name) : undefined)))
  return names.map((name, i): Device => ({
    platform: 'android',
    id: name,
    name,
    isRunning: running.has(name),
    serial: running.get(name),
    ...(unavailable[i] && { unavailable: unavailable[i] }),
  }))
}

const sleep = (run: Run, sec: number) => run(['sleep', String(sec)])

const bootLogPath = (d: Device): string => `${BOOT_LOG_DIR}/emu-${d.id}.log`

/** Whether an emulator process for this AVD is still alive (`--`: the pattern starts with a dash, which pgrep would take as an option). */
const isLaunching = async (run: Run, d: Device): Promise<boolean> =>
  (await run(['pgrep', '-f', '--', `-avd ${d.id}( |$)`])).exitCode === 0

/** The line that says why the emulator quit: its PANIC / FATAL / ERROR line, else the last one. */
export const parseBootFailure = (log: string): string | undefined => {
  const all = lines(log)
  return all.find(l => /^(PANIC|FATAL|ERROR)\b/.test(l)) ?? all.at(-1)
}

export const bootAndroid = async (run: Run, t: AndroidTools, d: Device): Promise<string> => {
  if (d.isRunning) return `${d.name} is already running (${d.serial}).`
  const refused = unavailableMessage(d)
  if (refused) return refused
  const log = bootLogPath(d)
  // Detach so the emulator outlives this call; keep its output to say why it quit.
  await run(['sh', '-c', 'nohup "$0" -avd "$1" >"$2" 2>&1 </dev/null &', t.emulator, d.id, log])

  const deadline = Date.now() + ANDROID_BOOT_TIMEOUT_MS
  let isFirstPoll = true
  while (Date.now() < deadline) {
    const serial = (await serialsByAvd(run, t)).get(d.id)
    if (serial) {
      const boot = await run([t.adb, '-s', serial, 'shell', 'getprop', 'sys.boot_completed'])
      if (boot.stdout.trim() === '1') return `Booted ${d.name} (${serial}).`
    } else if (!isFirstPoll && !(await isLaunching(run, d))) {
      // Gone before ever attaching (a missing system image, a broken AVD): waiting longer cannot help.
      const reason = parseBootFailure((await run(['cat', log])).stdout)
      return `${d.name} quit before booting${reason ? `: ${reason}` : ''} (log: ${log})`
    }
    isFirstPoll = false
    await sleep(run, ANDROID_POLL_INTERVAL_SEC)
  }
  return `${d.name} did not finish booting within ${ANDROID_BOOT_TIMEOUT_MS / 1000}s (log: ${log}).`
}

export const shutdownAndroid = async (run: Run, t: AndroidTools, d: Device): Promise<string> => {
  if (!d.serial) return `${d.name} is not running.`
  const r = await run([t.adb, '-s', d.serial, 'emu', 'kill'])
  if (r.exitCode !== 0) return `Failed to shut down ${d.name}: ${r.stderr.trim()}`
  // `emu kill` only asks; the emulator is down once it has left `adb devices`.
  for (let wait = 0; wait < ANDROID_SHUTDOWN_TIMEOUT_MS / 1000 / ANDROID_POLL_INTERVAL_SEC; wait += 1) {
    if (!(await serialsByAvd(run, t)).has(d.id)) return `Shut down ${d.name}.`
    await sleep(run, ANDROID_POLL_INTERVAL_SEC)
  }
  return `${d.name} did not shut down within ${ANDROID_SHUTDOWN_TIMEOUT_MS / 1000}s.`
}
