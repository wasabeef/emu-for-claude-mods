# Architecture

`emu` is one hooks module (`plugins/emu/hooks/register.tsx`) that registers commands, tools and a pane, backed by plain TypeScript in `hooks/lib/`. Everything that touches the OS goes through one function, so the logic is testable without a simulator.

## Modules

| File | Responsibility |
|---|---|
| `register.tsx` | Registers `/emu`, the three Claude tools, the pane (`ui.render`), key and scroll handling |
| `lib/service.ts` | `createService($)`: lists devices from both platforms, resolves a query, boots / stops |
| `lib/ios.ts` | `simctl` parsing, boot (`simctl boot`, `open -a Simulator`, `bootstatus -b`), shutdown |
| `lib/android.ts` | SDK discovery, `adb` / `emulator` handling, AVD checks, boot and shutdown with waiting |
| `lib/devices.ts` | Pure functions: ordering, query matching, focus stepping, column layout, status text |
| `lib/poll.ts` | Polling, state publishing, toasts, the pane's boot / stop actions and messages |
| `lib/constants.ts` | Every timeout, interval and limit |
| `lib/types.ts` | `Device`, `Run`, `Unavailable` |
| `types/index.d.ts` | The `$.state` contract under the `emu` key |

## The `Run` seam

```ts
type Run = (argv: readonly string[], timeoutMs?: number) => Promise<RunResult>
```

All commands are argv arrays run through `$.process.run`. `Run` never rejects: a command that cannot start yields exit code 127. Tests pass a fake `Run` that answers by argv, so every parser and flow in `ios.ts` / `android.ts` is tested without Xcode or an SDK.

## State and rendering

State lives in `$.state` under `emu` (`devices`, `focused`, `message`, `busy`, `isConfirmingStopAll`, `isExpanded`). The poller writes `devices`; the pane reads it. Row focus is tracked in an atom read at key-press time rather than captured at render time, so a fast `j j j` never acts on a stale row.

## Data flow

```
timer ─▶ poll() ─▶ refresh() ─▶ service.devices() ─▶ simctl / adb / emulator
                      │
                      ├─▶ $.state devices ─▶ pane re-renders
                      ├─▶ status line
                      └─▶ toast (only if the pane is closed and the device is not busy)
```

- The timer ticks every 5 s. With no pane open only every third tick does work (15 s).
- `refresh` numbers each read. A read that a newer one overtook is dropped, so a slow poll cannot put back an older snapshot.
- Devices marked `busy` (being booted or stopped by this mod) are excluded from change toasts: they report their own result.

## Platform notes

### iOS

- `simctl list devices available -j` is the source of truth; `Booted` means running. This also reflects simulators started or stopped outside the mod.
- `simctl boot` starts headless. The mod also runs `open -a Simulator` so a window appears; a simulator booted elsewhere gets a window only if Simulator.app is running.
- Exit code 149 (already booted) is treated as success.

### Android

- `emulator -list-avds` lists AVDs. Running ones are found with `adb devices` and `adb -s <serial> emu avd name`.
- An AVD is `unavailable` when its `config.ini` says the ABI cannot run on this CPU (`no arch`), or its `image.sysdir.1` folder is missing from the SDK (`no image`). An unreadable config counts as bootable.
- Boot detaches the emulator (`nohup … &`) with its output in `/tmp/emu-<avd>.log`, then polls until `sys.boot_completed` is `1`. If the process disappears before attaching to `adb`, the log's `PANIC` / `FATAL` / `ERROR` line is returned as the reason.
- `pgrep -f -- "-avd <name>( |$)"` checks the process is alive; `--` is required because the pattern starts with a dash.
- `adb emu kill` only asks the emulator to quit, so shutdown polls `adb devices` until it is gone (up to 60 s).

## Tests

- `lib/emu.test.ts`: parsers, matching, ordering, focus helpers, boot / shutdown flows with a fake `Run`.
- `pane.test.ts`: renders the pane against fake state and checks its text and layout.

Run both with `claude plugin test plugins/emu`.
