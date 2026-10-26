# Security Policy

## Reporting a vulnerability

Please report security issues privately through [GitHub private vulnerability reporting](https://github.com/wasabeef/emu-for-claude-mods/security/advisories/new) rather than a public issue. Include the affected version, steps to reproduce and the impact. You can expect an initial reply within a few days.

## What the mod runs

`emu` starts only these programs, always with argv arrays and never through a shell string built from user input:

- `xcrun simctl` (list, boot, bootstatus, shutdown), `open -a Simulator`
- the Android SDK's `adb` and `emulator`
- small utilities for reading state: `test`, `cat`, `uname`, `pgrep`, `sleep`, `sh` (to detach the emulator process)

It reads AVD config files under `ANDROID_AVD_HOME` (default `~/.android/avd`) and writes one log per booted AVD to `/tmp/emu-<avd>.log`. It makes no network requests and stores nothing outside Claude Code's own state.

The device argument of `boot`, `stop` and the Claude tools is matched against the list of known devices; it is never executed.

## Supported versions

Only the latest release receives fixes.
