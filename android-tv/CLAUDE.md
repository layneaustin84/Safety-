# Runbook: debloat an Android TV with tv.sh

You are on the user's laptop, on the same Wi-Fi as their TV. Use `./tv.sh`; do not improvise raw `adb` mutations, because only `tv.sh` journals changes into the restore script.

## Hard rules

- Never run `pm uninstall`, `pm clear`, `settings put` outside `tv.sh`, `reboot recovery`, or anything that wipes data.
- Never disable a package that is not in `catalog/*.tsv`. If the user wants one disabled, add it to the right catalogue file first, then run `./tv.sh debloat`.
- Run `./tv.sh backup` before any change, and confirm `restore.sh` exists in the backup folder.
- The `debloat`, `tweaks` and `launcher` steps prompt on the terminal (`/dev/tty`). Ask the user each `ask`-category question in chat and relay the answer; never use `ASSUME_YES=1` for the `ask` category on their behalf.

## Steps

1. `adb version` — if missing, tell the user the install command for their OS (see README).
2. `./tv.sh discover`, then `./tv.sh connect <ip>`. Tell the user to accept the prompt on the TV.
3. `./tv.sh backup`. Read `backups/<tv>/screenshots/*-00-before.png` and describe the stock home screen.
4. `./tv.sh debloat`. Show the user each batch list before answering. After each batch, **read the newest screenshot** and confirm the home screen still renders with no error dialog. If something looks wrong, re-enable that batch (the script offers it) and report.
5. `./tv.sh tweaks`.
6. Launcher APK: use `dist/minimal-tv-home.apk` if present; else build with `launcher/gradlew assembleRelease` if `ANDROID_HOME` is set; else ask the user to download the `minimal-tv-home` artifact from GitHub Actions into `dist/`.
7. `./tv.sh launcher`. Read the `launcher` screenshot: it must show a nature wallpaper, a clock top-right and a dock row. If HOME still opens the stock launcher, explain the trade-off before the user answers the "disable stock launcher" question.
8. `./tv.sh dock`. Ask the user which apps they want, in order.
9. Finish with `./tv.sh status` and give the user the absolute path of `restore.sh`.

## If something goes wrong

- TV unreachable after sleep: `./tv.sh connect <ip>` again.
- Boot loop or blank home screen: `backups/<tv>/restore.sh` (works over ADB as long as the TV boots far enough for adbd), then `adb reboot`.
- Screenshot is black: DRM-protected video is on screen; press HOME (`adb shell input keyevent KEYCODE_HOME`) and retry.
