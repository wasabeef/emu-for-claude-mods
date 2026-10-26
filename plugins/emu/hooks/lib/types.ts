export type Platform = 'ios' | 'android'

/** Why an Android AVD cannot boot on this machine: its system image is missing, or built for another CPU. */
export type Unavailable =
  | { kind: 'no-image'; /** sdkmanager package that provides the image */ package?: string }
  | { kind: 'no-arch'; /** abi.type of the AVD, such as x86_64 */ abi: string }

export type Device = {
  platform: Platform
  /** UDID (iOS) or AVD name (Android) */
  id: string
  name: string
  isRunning: boolean
  /** adb serial of a running Android emulator */
  serial?: string
  /** Runtime label such as "iOS 18.2" */
  detail?: string
  /** Set on an AVD that cannot boot here; such a device is listed but never started */
  unavailable?: Unavailable
}

export type RunResult = { exitCode: number; stdout: string; stderr: string }

/** Runs a command by argv. Never rejects: a command that cannot start gives exitCode 127. */
export type Run = (argv: readonly string[], timeoutMs?: number) => Promise<RunResult>
