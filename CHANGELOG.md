# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and `emu` uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `h` / `l` jump between the iOS and Android lists; `↑` / `↓` move the focus even when the full list is taller than the pane.
- Android AVDs that cannot boot (`no image`, `no arch`) are listed as unavailable with the fix, and are never started.
- A boot that fails reports why: the emulator's `PANIC` / `FATAL` / `ERROR` line and the log path (`/tmp/emu-<avd>.log`).
- Android shutdown waits until the emulator has left `adb devices`, and reports `did not shut down within 60s.` otherwise.

### Fixed

- A successful Android boot was reported as "quit before booting": `pgrep` took the `-avd` pattern as an option.
- A slow poll could overwrite a newer device snapshot with an older one.
- The focus could stop following `j` / `k` after the first key press.

## [0.2.0]

### Added

- Manager pane with state chips, keyboard navigation, two-column layout, auto-close and result line.
- Commands `/emu list`, `boot`, `stop`, `stop-all`, `close`, `help`.
- Tools `mcp__emu__devices`, `mcp__emu__boot`, `mcp__emu__shutdown`.
- Status line entry and toasts for devices started or stopped, including from outside Claude Code.

[Unreleased]: https://github.com/wasabeef/emu-for-claude-mods/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/wasabeef/emu-for-claude-mods/releases/tag/v0.2.0
