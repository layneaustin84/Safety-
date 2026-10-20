# Android TV debloat + minimal home screen

Makes a slow, ad-filled Android TV / Google TV fast again from a laptop on the same Wi-Fi:

1. **Finds** the TV on the network and connects over ADB.
2. **Backs up** the package list, settings and current home app before touching anything, and writes a standalone `restore.sh`.
3. **Debloats** reversibly: manufacturer ads, telemetry and junk are disabled with `pm disable-user`; apps and features you might use are asked about one by one. **Nothing is uninstalled.**
4. **Installs a minimal Apple TV-style launcher**: rotating nature wallpapers, a clock, a dock of favourite apps and an "All apps" grid.
5. **Screenshots the TV after every step** (`backups/<tv>/screenshots/`) so each change can be checked.

## Requirements

| | |
|---|---|
| Laptop | macOS, Linux or Windows (WSL / Git Bash), on the same Wi-Fi as the TV |
| `adb` | macOS `brew install android-platform-tools` · Debian/Ubuntu `sudo apt install adb` · Windows `winget install Google.PlatformTools` |
| TV | Android TV / Google TV 7.0+ (Fire TV works for debloat; its home screen cannot be replaced) |
| Launcher APK | Download the `minimal-tv-home` artifact from this repo's **Actions** tab, or build it (`launcher/`, needs the Android SDK) |

## On the TV: turn on debugging

1. **Settings → System → About** → select **Android TV OS build** 7 times ("You are now a developer").
2. **Settings → System → Developer options** → **USB debugging** ON. Some models also list **Network debugging** / **ADB over network**: turn it ON.
3. Note the TV's IP: **Settings → Network & Internet → (your Wi-Fi)**.

## Run it

```sh
cd android-tv
mkdir -p dist && cp ~/Downloads/minimal-tv-home.apk dist/   # from the Actions artifact
./tv.sh all
```

`all` runs the steps below in order. Accept the **Allow USB debugging?** prompt on the TV (tick *Always allow*). Every question defaults to the safe answer; press Enter to keep an app.

| Command | What it does | Reversible via |
|---|---|---|
| `./tv.sh discover` | Scans the local /24 for port 5555 and mDNS ADB services | — |
| `./tv.sh connect [ip]` | Connects and waits for the on-TV authorisation | — |
| `./tv.sh backup` | Saves packages, settings, home app; creates `restore.sh` | — |
| `./tv.sh debloat` | Ads/telemetry/junk as batches (Yes / No / Each), optional apps individually (default keep) | `restore.sh` |
| `./tv.sh tweaks` | Animation scale 1.0 → 0.5 | `restore.sh` |
| `./tv.sh launcher` | Installs the launcher, sets it as HOME, verifies with a screenshot | `restore.sh` |
| `./tv.sh dock` | Pick and order dock apps by number | edit again |
| `./tv.sh wallpapers DIR` | Adds your own photos to the rotation | delete in app data |
| `./tv.sh screenshot [label]` | Captures the screen | — |
| `./tv.sh restore` | Runs the latest backup's `restore.sh` | — |

### Going back to stock

```sh
android-tv/backups/<TV>-<timestamp>/restore.sh            # same IP as before
android-tv/backups/<TV>-<timestamp>/restore.sh 192.168.1.77   # TV has a new IP
android-tv/backups/<TV>-<timestamp>/restore.sh --dry-run      # show the adb commands only
```

It replays `changes.tsv` newest-first (re-enables packages, restores settings and the original home app), then re-enables **every** package that was enabled at backup time, and removes the launcher (`--keep-launcher` to keep it). It needs only `adb`, so the folder can be copied to another computer. A factory reset also undoes everything, because no system app was uninstalled.

## Safety model

- **Disable, never uninstall.** `pm disable-user --user 0` keeps the APK on the system partition; `pm enable` restores it instantly.
- **Journal before mutate.** Each change is appended to `changes.tsv` before it is made, so an interrupted run is still restorable.
- **Hard deny-list.** Play Services, Play Store framework, Settings, setup wizard, IME, remote/Bluetooth stack and OTA updaters match `PROTECTED_RE` in `lib/common.sh` and are refused even if the catalogue lists them.
- **Known packages only.** Only packages in `catalog/*.tsv` are offered. Unrecognised vendor packages are written to `uncatalogued-vendor-packages.txt` for review, never touched.
- **Crash check.** After every batch the script goes HOME, screenshots, and checks for a crash/ANR dialog; if one appears it offers to re-enable that batch immediately.
- **Launcher fallback.** If HOME still opens the stock launcher (Google TV hard-wires it on some builds), disabling the stock launcher is offered (default **no**); if the new launcher still does not appear, the stock one is re-enabled automatically.

## The launcher

`launcher/` is a dependency-free Java app (framework views only, no AndroidX), minSdk 21, so it starts fast on 1 GB TV boxes.

| Remote | Action |
|---|---|
| ◀ ▶ | Move along the dock |
| OK | Open app |
| ▼ | Open **All apps** |
| ▲ on the top row / BACK | Close **All apps** |
| Long-press OK or MENU | Add to / remove from dock, move left/right, app info |
| HOME | Back to the dock |

- **Wallpapers:** six 1080p nature images (`wallpapers/`, AI-generated for this project, no third-party licence) are bundled; images pushed with `./tv.sh wallpapers` are added. One changes every 60 s with a 1.5 s cross-fade and a slow zoom. Decoded at screen size as RGB_565 (~4 MB per frame), and paused while another app is in front.
- **Dock:** defaults to installed streaming apps (Netflix, YouTube, Prime Video, Disney+, …). `./tv.sh dock` writes `dock.txt` to the app's external files folder; on-TV edits are saved in app preferences.
- **Signing:** builds are signed with the committed `launcher/app/shared.keystore` (password `minimaltvhome`) so a CI build can update a locally built one. The key grants nothing beyond what ADB access already does; replace it if you publish your own fork.

### Building locally

```sh
cd android-tv/launcher
./gradlew assembleRelease     # needs ANDROID_HOME pointing at an SDK with platform 35
# -> app/build/outputs/apk/release/app-release.apk (tv.sh finds it automatically)
```

## Tests

```sh
android-tv/test/run.sh   # full backup/debloat/launcher/restore round-trip against a fake adb
```

CI (`.github/workflows/android-tv.yml`) runs ShellCheck, this test, Android lint and the release build, and publishes the APK as the `minimal-tv-home` artifact.

## Using Claude Code on the laptop

`CLAUDE.md` in this folder is a runbook for Claude Code: open Claude Code in `android-tv/` on the laptop and ask it to debloat the TV. It uses these scripts, reads every screenshot, and asks before each optional change.
