# emu-for-claude-mods

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Claude Code](https://claude.com/claude-code) mods marketplace. It currently ships one mod, **emu**: start, stop and monitor iOS simulators and Android emulators without leaving Claude Code.

Inspired by [wasabeef/emu](https://github.com/wasabeef/emu). This `emu` manages the *lifecycle* of devices only (boot, shut down, status). It does not touch what runs inside them: no screenshots, taps, app installs or URL opening.

- **One pane for both platforms**: iOS and Android side by side, running devices first, driven from the keyboard.
- **Sees changes made elsewhere**: a simulator started from Xcode or an emulator closed from Android Studio shows up within seconds.
- **Claude can use it too**: three tools let the model list, boot and shut down devices on its own.
- **Honest about failures**: an AVD that cannot boot here is marked and never started; an emulator that quits during boot reports why.

```
2 running · 8 devices · tab / j k move · enter boot/stop · esc close

iOS Simulators  1/4 running              Android Emulators  1/4 running
▶ 1 iPhone 17 Pro iOS 26.3 ● ⏎ Stop        5 Pixel_9_API_36      emulator-5554 ● running
  2 iPhone 17     iOS 26.3 ○ stopped       6 Pixel_8_API_35                    ○ stopped
  3 iPhone 16e    iOS 26.3 ○ stopped       7 Pixel_Tablet_API_35               ○ stopped
  4 iPad (A16)    iOS 26.3 ○ stopped       ✕ 1 unavailable (a: show)

h: iOS l: Android j: down k: up a: all (+1) x: stop all (2) r: refresh c: close
```

<sub>The `/emu` pane in a wide terminal. The focused row shows the action `enter` will take.</sub>

## Requirements

| | |
|---|---|
| Claude Code | 2.1.299 or later with the mods API (early access, may change between releases) |
| OS | macOS |
| iOS | Xcode Command Line Tools (`xcrun simctl`) |
| Android | Android SDK with `platform-tools` and `emulator`, found via `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `~/Library/Android/sdk` |

Either platform alone is enough; the other is simply left out of the list.

## Install

```
/plugin install emu --marketplace wasabeef/emu-for-claude-mods
```

Then run `/reload-plugins`, or restart Claude Code.

## Usage

| Command | What it does |
|---|---|
| `/emu` | Open the manager pane (same as `/emu pane`) |
| `/emu list` | List devices as text |
| `/emu boot <device>` | Boot a device and wait until it is ready |
| `/emu stop <device>` | Shut a device down |
| `/emu stop-all` | Shut down every running device |
| `/emu close` | Close the pane |
| `/emu help` | Show usage |

```
> /emu list
[ios] iPhone 17 Pro (iOS 26.3) - running - id: 6F1C2E0A-3B7D-4C1E-9A52-0D8E7F4B1C33
[ios] iPhone 17 (iOS 26.3) - stopped - id: 2B9A41D7-8E6C-4F05-B3A1-7C2D9E0F5A18
[android] Pixel_9_API_36 (emulator-5554) - running - id: Pixel_9_API_36
[android] Pixel_8_API_35 - stopped - id: Pixel_8_API_35

> /emu boot 17
"17" is ambiguous:
[ios] iPhone 17 Pro (iOS 26.3) - running - id: 6F1C2E0A-3B7D-4C1E-9A52-0D8E7F4B1C33
[ios] iPhone 17 (iOS 26.3) - stopped - id: 2B9A41D7-8E6C-4F05-B3A1-7C2D9E0F5A18
```

`<device>` is a name substring, a UDID, an AVD name or an adb serial. It may be omitted when exactly one device is running. An ambiguous query lists the candidates instead of guessing.

### The pane

iOS devices come first (phones before tablets, newer runtimes first), then Android. Running devices sort to the top of each list. Each row shows a state chip; the focused row is marked `▶` and its state turns into the action `Enter` will perform (`⏎ Boot` / `⏎ Stop`). Wide panes put iOS and Android side by side.

| Key | Action |
|---|---|
| `tab`, `↑` / `↓`, `j` / `k` | Move the focus |
| `h` / `l` | Jump to the iOS / Android list at the same position |
| `enter` | Boot or stop the focused device |
| `a` | Toggle all devices / fewer rows |
| `x` (twice within 3 s) | Stop every running device |
| `r` | Refresh now |
| `c` / `esc` | Close |

Other behavior:

- The pane opens focused (`ctrl+x tab` refocuses it) and closes itself after 1 minute without input.
- The result of a boot or stop is shown on a line that clears after 5 seconds.
- Mouse clicks work only in the fullscreen layout.
- While collapsed, the pane keeps running devices plus the first 12 of each platform.

### Unavailable AVDs

An AVD that cannot boot on this machine stays in the list but is never started:

| Chip | Meaning | Fix |
|---|---|---|
| `✕ no image` | The system image is not installed | Run the `sdkmanager "<package>"` command shown in the message |
| `✕ no arch` | The image targets another CPU (for example x86_64 on Apple Silicon) | Create an AVD with a matching image |

They sort last, are hidden while the list is collapsed (`✕ N unavailable`), and are reported as `unavailable` by `/emu list` and `mcp__emu__devices`.

### Status line and toasts

The status line shows what is running (`emu: 2 running · iPhone 17 Pro, Pixel_9_API_36`). A toast announces when a device starts or stops, including changes made outside Claude Code. While the pane is open it shows the news itself, so no toast is raised. State is polled every 5 s while the pane is open and every 15 s otherwise.

### Tools for Claude

| Tool | Purpose |
|---|---|
| `mcp__emu__devices` | List simulators and emulators with their state |
| `mcp__emu__boot` | Boot a device and wait until it is ready |
| `mcp__emu__shutdown` | Shut a device down |

`boot` and `shutdown` take an optional `device` with the same matching rules as the commands.

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md). Common cases: no Android devices listed, a simulator that boots without a window, an emulator that quits during boot.

## Documentation

- [Architecture](docs/architecture.md): how the mod is built and why
- [Troubleshooting](docs/troubleshooting.md)
- [Requirements (Japanese)](docs/requirements.ja.md): the original product requirements
- [Changelog](CHANGELOG.md)

## Development

```sh
claude --plugin-dir plugins/emu            # load the mod in a session
claude plugin validate plugins/emu         # check the manifest and module
claude plugin test plugins/emu             # run the tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and conventions.

## License

[MIT](LICENSE) © wasabeef
