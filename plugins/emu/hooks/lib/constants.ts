export const DEFAULT_TIMEOUT_MS = 30_000
export const IOS_BOOT_TIMEOUT_MS = 240_000
export const ANDROID_BOOT_TIMEOUT_MS = 240_000
export const ANDROID_POLL_INTERVAL_SEC = 2
/** An emulator told to quit takes a while to leave `adb devices`; wait this long for it */
export const ANDROID_SHUTDOWN_TIMEOUT_MS = 60_000
export const ANDROID_SDK_FALLBACK = '~/Library/Android/sdk'
export const AVD_HOME_FALLBACK = '~/.android/avd'
export const NOT_FOUND_EXIT_CODE = 127
export const SIMCTL_ALREADY_BOOTED_EXIT_CODE = 149
export const POLL_INTERVAL_MS = 5_000
/** While no pane is open the poller only runs on every Nth tick */
export const IDLE_POLL_EVERY_N_TICKS = 3
export const PANE_ID = 'emu'
/** Rows per platform the pane shows while collapsed (running rows are always shown) */
export const PANE_COLLAPSED_ROWS = 12
/** Lines the pane spends outside the device rows: summary, two group headings, footer, message, spacing */
export const PANE_CHROME_ROWS = 8
/** The pane closes itself after this long without a key press or click on it */
export const PANE_AUTO_CLOSE_MS = 60_000
/** A pane message (boot / stop result) disappears after this long */
export const MESSAGE_CLEAR_MS = 5_000
/** After the first `x`, the second press within this long confirms stop-all */
export const STOP_ALL_CONFIRM_MS = 3_000
/** Where an emulator's launch output is kept (read back when it quits before booting) */
export const BOOT_LOG_DIR = '/tmp'
