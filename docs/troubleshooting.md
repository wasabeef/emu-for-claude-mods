# Troubleshooting

## No Android devices are listed

The mod looks for `platform-tools/adb` and `emulator/emulator` under, in order, `ANDROID_HOME`, `ANDROID_SDK_ROOT` and `~/Library/Android/sdk`. Both must be executable. `/emu list` prints `Android SDK not found…` when none matches.

Check from a terminal:

```sh
ls "$ANDROID_HOME/platform-tools/adb" "$ANDROID_HOME/emulator/emulator"
"$ANDROID_HOME/emulator/emulator" -list-avds
```

If AVDs live elsewhere, set `ANDROID_AVD_HOME`. Claude Code must have these variables in its own environment.

## No iOS simulators are listed

```sh
xcrun simctl list devices available
```

If this fails, install the Command Line Tools (`xcode-select --install`) and select Xcode (`xcode-select -p`).

## A simulator is running but has no window or Dock icon

`simctl boot` starts a simulator headless. The mod runs `open -a Simulator` when it boots one. A simulator started from the terminal, or after quitting Simulator.app, shows no window until you open Simulator.app yourself.

## `✕ no image` on an AVD

The AVD's system image is not installed. Run the command from the message, for example:

```sh
sdkmanager "system-images;android-35;google_apis;arm64-v8a"
```

## `✕ no arch` on an AVD

The AVD targets another CPU than this machine (for example `x86_64` on Apple Silicon). Create an AVD with a matching image (`arm64-v8a` on Apple Silicon) in Android Studio.

## "… quit before booting"

The emulator process exited before `adb` saw it. The message ends with the emulator's own error line and the log path:

```sh
cat /tmp/emu-<AVD name>.log
```

Typical causes: a broken AVD, a missing image, or another instance already using the AVD.

## "… did not finish booting within 240s"

The emulator is still running but `sys.boot_completed` never became `1`. A cold first boot can be slow; check the emulator window and the log above. The process is left running.

## "… did not shut down within 60s"

`adb emu kill` was sent but the emulator is still attached. Close its window, or find the process with `pgrep -fl "emulator.*-avd <name>"`.

## The pane shows an old state

The pane polls every 5 s. Press `r` to refresh immediately. A device changed outside Claude Code appears at the next poll.

## Keys do nothing

The pane only reacts while focused. It opens focused; press `ctrl+x tab` to refocus it. After editing the mod, run `/reload-plugins`.

## Still stuck

Open an issue with: Claude Code version, macOS version, `/emu list` output, and the output of `xcrun simctl list devices available` / `emulator -list-avds` as relevant.
