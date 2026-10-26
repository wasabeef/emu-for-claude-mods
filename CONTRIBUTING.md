# Contributing

Thanks for helping improve emu-for-claude-mods. Bug reports, fixes and small features are welcome.

## Scope

`emu` manages the **lifecycle** of iOS simulators and Android emulators: list, boot, stop, status. Changes that act on what runs inside a device (screenshots, taps, input, installing or launching apps, opening URLs, mirroring) are out of scope. Open an issue before starting a larger feature.

## Setup

You need Claude Code 2.1.299 or later, macOS, and ideally both Xcode Command Line Tools and an Android SDK.

```sh
claude --plugin-dir plugins/emu       # try your changes in a session
claude plugin validate plugins/emu    # manifest and module checks
claude plugin test plugins/emu        # run the tests
```

After editing a hooks module in a running session, run `/reload-plugins`.

## Layout

```
plugins/emu/
  .claude-plugin/plugin.json   manifest
  types/index.d.ts             the mod's $.state contract
  hooks/register.tsx           commands, tools, pane and key handling
  hooks/lib/                   device logic, split by concern (see docs/architecture.md)
  hooks/lib/emu.test.ts        unit tests for the logic
  hooks/pane.test.ts           tests that render the pane
```

## Conventions

- Match the surrounding code: naming, comment density, idiom. TypeScript, no semicolons, single quotes.
- No magic numbers: put timeouts, intervals and limits in `hooks/lib/constants.ts`.
- Keep OS commands behind the `Run` function (`hooks/lib/types.ts`) so tests can mock them. Pass argv arrays, never shell strings built from user input.
- Early returns over nesting. Prefer clarity over abstraction.
- Every behavior change comes with a test. A bug fix comes with a test that fails without the fix.
- Verify a bug in code (types, tests) before asking anyone to reproduce it by hand.
- Keep structural changes (renames, moves, formatting) and behavior changes in separate commits.

## Pull requests

1. `claude plugin validate plugins/emu` and `claude plugin test plugins/emu` both pass.
2. Update `README.md` and `CHANGELOG.md` (under `[Unreleased]`) when behavior or keys change.
3. Describe what changed and why, and how you checked it. Say so if you could not test on a real device.

By contributing you agree that your work is released under the [MIT License](LICENSE).
