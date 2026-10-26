export type PaneDevice = {
  platform: 'ios' | 'android'
  id: string
  name: string
  isRunning: boolean
  serial?: string
  detail?: string
  /** An AVD that cannot boot here: its system image is missing, or built for another CPU */
  unavailable?: { kind: 'no-image'; package?: string } | { kind: 'no-arch'; abi: string }
}

declare module 'claude-code' {
  interface PluginState {
    emu: {
      /** Latest device snapshot taken by the poller */
      devices: PaneDevice[]
      /** `key` of the pane element holding the focus ring (a `row-<id>` or a footer button) */
      focused: string | null
      /** Result line of the last boot / stop done from the pane */
      message: string | null
      /** Device id -> what it is busy doing ("Booting" / "Stopping") */
      busy: Record<string, string>
      /** Whether `x` was pressed once and a second press will stop everything */
      isConfirmingStopAll: boolean
      /** Whether the pane lists every device or only running / the first few per platform */
      isExpanded: boolean
    }
  }
}
