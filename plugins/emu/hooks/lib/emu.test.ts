import { expect, test } from 'claude-code/testing'
import { bootAndroid, imagePackage, isAbiRunnable, listAndroid, parseAdbEmulators, parseAvdName, parseBootFailure, parseIniValue, shutdownAndroid } from './android'
import { jumpPlatform, arrowStep, collapseDevices, formatDevices, unavailableMessage, layoutColumns, formatStatus, orderDevices, resolveDevice, rowsThatFit, stepFocus } from './devices'
import { parseSimctl } from './ios'
import { describeChanges, isFailure } from './poll'
import type { Device } from './types'

const devices: Device[] = [
  { platform: 'ios', id: 'AAAA', name: 'iPhone 16 Pro', isRunning: true },
  { platform: 'ios', id: 'BBBB', name: 'iPad Pro', isRunning: false },
  { platform: 'android', id: 'Pixel_8', name: 'Pixel_8', isRunning: false },
]

test('parseSimctl keeps available devices with a runtime label', () => {
  const json = JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-2': [
        { udid: 'U1', name: 'iPhone 16', state: 'Booted', isAvailable: true },
        { udid: 'U2', name: 'Old', state: 'Shutdown', isAvailable: false },
      ],
    },
  })
  expect(parseSimctl(json)).toEqual([
    { platform: 'ios', id: 'U1', name: 'iPhone 16', isRunning: true, detail: 'iOS 18.2' },
  ])
})

test('adb parsing', () => {
  expect(parseAdbEmulators('List of devices attached\nemulator-5554\tdevice\nR58M\tdevice\nemulator-5556\toffline\n'))
    .toEqual(['emulator-5554'])
  expect(parseAvdName('Pixel_8\nOK\n')).toBe('Pixel_8')
})

test('resolveDevice', () => {
  expect(resolveDevice(devices)).toEqual({ device: devices[0] })
  expect(resolveDevice(devices, 'pixel')).toEqual({ device: devices[2] })
  expect(resolveDevice(devices, 'BBBB')).toEqual({ device: devices[1] })
  expect('error' in resolveDevice(devices, 'pro')).toBe(true)
  expect('error' in resolveDevice(devices, 'nothing')).toBe(true)
})

test('orderDevices lists iOS first and running first', () => {
  expect(orderDevices(devices).map(d => d.id)).toEqual(['AAAA', 'BBBB', 'Pixel_8'])
})

test('formatStatus', () => {
  expect(formatStatus(devices)).toBe('1 running · iPhone 16 Pro')
  expect(formatStatus([devices[1]])).toBeUndefined()
})

test('describeChanges reports state flips only', () => {
  const after = devices.map(d => (d.id === 'AAAA' ? { ...d, isRunning: false } : d))
  expect(describeChanges(devices, after)).toEqual(['iPhone 16 Pro stopped'])
  expect(describeChanges(devices, devices)).toEqual([])
})

test('collapseDevices keeps running and the first rows per platform', () => {
  const many: Device[] = ['a', 'b', 'c', 'd'].map(n => ({ platform: 'ios', id: n, name: n, isRunning: n === 'd' }))
  expect(collapseDevices(many, 1).map(d => d.id)).toEqual(['a', 'd'])
})

test('orderDevices puts phones before tablets and newer iOS first', () => {
  const list: Device[] = [
    { platform: 'ios', id: '1', name: 'iPad Pro', isRunning: false, detail: 'iOS 26.3' },
    { platform: 'ios', id: '2', name: 'iPhone 16', isRunning: false, detail: 'iOS 18.5' },
    { platform: 'ios', id: '3', name: 'iPhone 17', isRunning: false, detail: 'iOS 26.3' },
    { platform: 'ios', id: '4', name: 'iPhone 16', isRunning: false, detail: 'iOS 18.1' },
  ]
  expect(orderDevices(list).map(d => d.id)).toEqual(['3', '2', '4', '1'])
})

test('formatDevices uses the pane order', () => {
  const lines = formatDevices([devices[2], devices[1], devices[0]]).split('\n')
  expect(lines.map(l => l.split(' ')[0])).toEqual(['[ios]', '[ios]', '[android]'])
  expect(lines[0]).toContain('iPhone 16 Pro')
})

test('isFailure spots failed results, also in multi-line output', () => {
  expect(isFailure('Booted iPhone 16 Pro.')).toBe(false)
  expect(isFailure('Failed to boot iPhone 16 Pro: x')).toBe(true)
  expect(isFailure('Shut down A.\nFailed to shut down B: x')).toBe(true)
  expect(isFailure('Pixel_8 did not finish booting within 240s.')).toBe(true)
})

test('stepFocus moves one row and stays inside the list', () => {
  expect(stepFocus([], null, 1)).toBeUndefined()
  expect(stepFocus(devices, null, 1)).toBe('row-BBBB')
  expect(stepFocus(devices, 'row-BBBB', 1)).toBe('row-Pixel_8')
  expect(stepFocus(devices, 'row-Pixel_8', 1)).toBe('row-Pixel_8')
  expect(stepFocus(devices, 'row-AAAA', -1)).toBe('row-AAAA')
})

test('rowsThatFit keeps the collapsed pane inside the viewport', () => {
  expect(rowsThatFit(undefined, 8, 12)).toBe(12)
  expect(rowsThatFit(40, 8, 12)).toBe(12)
  expect(rowsThatFit(24, 8, 12)).toBe(8)
  expect(rowsThatFit(10, 8, 12)).toBe(3)
})

test('arrowStep turns only the person\'s one-row key scrolls into focus steps', () => {
  const person = { kind: 'person' }
  expect(arrowStep({ by: 1, origin: person })).toBe(1)
  expect(arrowStep({ by: -1, origin: person })).toBe(-1)
  expect(arrowStep({ by: 1, origin: person, pointer: { row: 3 } })).toBeUndefined()
  expect(arrowStep({ by: 12, origin: person })).toBeUndefined()
  expect(arrowStep({ by: 1, origin: { kind: 'plugin' } })).toBeUndefined()
})

test('layoutColumns goes side by side only when both lists fit, and adds the hint only with room to spare', () => {
  expect(layoutColumns(100, [40, 30], 2, 8)).toEqual({ isTwoColumn: true, isHintRoomy: true })
  expect(layoutColumns(80, [40, 30], 2, 8)).toEqual({ isTwoColumn: true, isHintRoomy: false })
  expect(layoutColumns(71, [40, 30], 2, 8)).toEqual({ isTwoColumn: false, isHintRoomy: false })
  expect(layoutColumns(200, [40], 2, 8)).toEqual({ isTwoColumn: false, isHintRoomy: false })
})

test('parseBootFailure picks the PANIC line, else the last line', () => {
  expect(parseBootFailure('PANIC: Broken AVD system path.\nINFO | x\nWARNING | y')).toBe('PANIC: Broken AVD system path.')
  expect(parseBootFailure('INFO | a\nINFO | b')).toBe('INFO | b')
  expect(parseBootFailure('')).toBeUndefined()
})

test('an emulator that quits before attaching fails fast with its reason', async () => {
  const tools = { adb: '/sdk/adb', emulator: '/sdk/emulator' }
  const run = async (argv: readonly string[]) => {
    const ok = (stdout = '', exitCode = 0) => ({ exitCode, stdout, stderr: '' })
    // pgrep takes a pattern that starts with a dash as an option and exits 2 (read as "not running") unless `--` comes first
    if (argv[0] === 'pgrep') return ok('', argv[argv.indexOf('-f') + 1] === '--' ? 1 : 2)
    if (argv[0] === 'cat') return ok('PANIC: Broken AVD system path.\n')
    return ok()
  }
  const msg = await bootAndroid(run, tools, { platform: 'android', id: 'Pixel_4_API_29', name: 'Pixel_4_API_29', isRunning: false })
  expect(msg).toContain('quit before booting: PANIC: Broken AVD system path.')
  expect(isFailure(msg)).toBe(true)
})

const SHUTDOWN_DEVICE: Device = { platform: 'android', id: 'Pixel_9', name: 'Pixel_9', isRunning: true, serial: 'emulator-5554' }

const adbRun = (isStillListed: boolean) => async (argv: readonly string[]) => {
  const out = argv.includes('devices') ? `List of devices attached\n${isStillListed ? 'emulator-5554\tdevice\n' : ''}` : argv.includes('name') ? 'Pixel_9\nOK\n' : ''
  return { exitCode: 0, stdout: out, stderr: '' }
}

test('an Android stop is done once the emulator has left adb devices', async () => {
  const tools = { adb: '/sdk/adb', emulator: '/sdk/emulator' }
  expect(await shutdownAndroid(adbRun(false), tools, SHUTDOWN_DEVICE)).toBe('Shut down Pixel_9.')
  const stuck = await shutdownAndroid(adbRun(true), tools, SHUTDOWN_DEVICE)
  expect(stuck).toContain('did not shut down')
  expect(isFailure(stuck)).toBe(true)
})

test('the liveness check hands pgrep its dash-leading pattern after --', async () => {
  const tools = { adb: '/sdk/adb', emulator: '/sdk/emulator' }
  const pgrep: string[][] = []
  const run = async (argv: readonly string[]) => {
    if (argv[0] === 'pgrep') pgrep.push([...argv])
    return { exitCode: argv[0] === 'pgrep' ? 1 : 0, stdout: '', stderr: '' }
  }
  await bootAndroid(run, tools, { platform: 'android', id: 'Pixel_9', name: 'Pixel_9', isRunning: false })
  expect(pgrep[0]).toEqual(['pgrep', '-f', '--', '-avd Pixel_9( |$)'])
})

test('parseIniValue reads one key', () => {
  expect(parseIniValue('abi.type=arm64-v8a\nimage.sysdir.1 = system-images/android-34/x/\n', 'image.sysdir.1')).toBe('system-images/android-34/x/')
  expect(parseIniValue('abi.type=x86_64', 'path')).toBeUndefined()
})

test('isAbiRunnable matches the AVD CPU to the host CPU', () => {
  expect(isAbiRunnable('arm64-v8a', 'arm64')).toBe(true)
  expect(isAbiRunnable('x86_64', 'arm64')).toBe(false)
  expect(isAbiRunnable('x86_64', 'x86_64')).toBe(true)
  expect(isAbiRunnable('arm64-v8a', 'x86_64')).toBe(false)
  expect(isAbiRunnable('x86_64', 'riscv64')).toBe(true)
})

test('imagePackage turns an image dir into an sdkmanager package', () => {
  expect(imagePackage('system-images/android-29/google_apis_playstore/arm64-v8a/')).toBe('system-images;android-29;google_apis_playstore;arm64-v8a')
  expect(imagePackage('/opt/custom/image')).toBeUndefined()
})

const avdRun = (configs: Record<string, string>, installed: string[]) => async (argv: readonly string[]) => {
  const ok = (stdout = '', exitCode = 0) => ({ exitCode, stdout, stderr: '' })
  if (argv[1] === '-list-avds') return ok(Object.keys(configs).join('\n'))
  if (argv[0] === 'cat') {
    const name = argv[1].split('/').pop()!.replace(/\.ini$/, '')
    if (argv[1].endsWith('.ini') && !argv[1].endsWith('config.ini')) return ok(`path=/avd/${name}.avd`)
    return configs[argv[1].split('/').at(-2)!.replace(/\.avd$/, '')] ? ok(configs[argv[1].split('/').at(-2)!.replace(/\.avd$/, '')]) : ok('', 1)
  }
  if (argv[0] === 'test') return ok('', installed.includes(argv[2]) ? 0 : 1)
  return ok()
}

test('listAndroid flags AVDs whose image is missing or built for another CPU', async () => {
  const tools = { adb: '/sdk/platform-tools/adb', emulator: '/sdk/emulator/emulator' }
  const run = avdRun({
    Good: 'abi.type=arm64-v8a\nimage.sysdir.1=system-images/android-34/google_apis/arm64-v8a/',
    NoImage: 'abi.type=arm64-v8a\nimage.sysdir.1=system-images/android-29/google_apis_playstore/arm64-v8a/',
    Intel: 'abi.type=x86_64\nimage.sysdir.1=system-images/android-35/google_apis/x86_64/',
    Bare: '',
  }, ['/sdk/system-images/android-34/google_apis/arm64-v8a/'])
  const list = await listAndroid(run, tools, { avdHome: '/avd', hostArch: 'arm64' })
  const by = Object.fromEntries(list.map(d => [d.id, d.unavailable]))
  expect(by.Good).toBeUndefined()
  expect(by.NoImage).toEqual({ kind: 'no-image', package: 'system-images;android-29;google_apis_playstore;arm64-v8a' })
  expect(by.Intel).toEqual({ kind: 'no-arch', abi: 'x86_64' })
  expect(by.Bare).toBeUndefined()
})

test('an unavailable AVD is listed last, left out of the collapsed list and refused at boot', async () => {
  const bad: Device = { platform: 'android', id: 'Old', name: 'Old', isRunning: false, unavailable: { kind: 'no-image', package: 'system-images;android-29;x;arm64-v8a' } }
  const good: Device = { platform: 'android', id: 'New', name: 'New', isRunning: false }
  expect(orderDevices([bad, good]).map(d => d.id)).toEqual(['New', 'Old'])
  expect(collapseDevices(orderDevices([bad, good]), 5).map(d => d.id)).toEqual(['New'])
  expect(formatDevices([bad])).toContain('unavailable: system image not installed')
  const msg = await bootAndroid(async () => ({ exitCode: 0, stdout: '', stderr: '' }), { adb: 'adb', emulator: 'emulator' }, bad)
  expect(msg).toBe('Cannot boot Old: system image not installed. Run: sdkmanager "system-images;android-29;x;arm64-v8a"')
  expect(isFailure(msg)).toBe(true)
  expect(unavailableMessage({ ...bad, unavailable: { kind: 'no-arch', abi: 'x86_64' } })).toContain('x86_64 image does not match')
  expect(unavailableMessage(good)).toBeUndefined()
})

test('jumpPlatform hops to the other list at the same position, clamped', () => {
  const list: Device[] = [
    { platform: 'ios', id: 'i1', name: 'a', isRunning: false },
    { platform: 'ios', id: 'i2', name: 'b', isRunning: false },
    { platform: 'ios', id: 'i3', name: 'c', isRunning: false },
    { platform: 'android', id: 'a1', name: 'd', isRunning: false },
    { platform: 'android', id: 'a2', name: 'e', isRunning: false },
  ]
  expect(jumpPlatform(list, 'row-i2', 'android')).toBe('row-a2')
  expect(jumpPlatform(list, 'row-i3', 'android')).toBe('row-a2')
  expect(jumpPlatform(list, null, 'android')).toBe('row-a1')
  expect(jumpPlatform(list, 'row-a2', 'ios')).toBe('row-i2')
  expect(jumpPlatform(list, 'row-a1', 'android')).toBeUndefined()
  expect(jumpPlatform(list.slice(0, 3), 'row-i1', 'android')).toBeUndefined()
})
