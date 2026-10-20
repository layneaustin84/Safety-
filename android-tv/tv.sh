#!/usr/bin/env bash
# Android TV debloat + minimal launcher toolkit. Run ./tv.sh help.
set -Eeuo pipefail

# shellcheck source=lib/common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

usage() {
  cat <<EOF
Usage: ./tv.sh <command> [args]

Guided
  all                      connect -> backup -> debloat -> tweaks -> launcher -> dock

Steps
  discover [a.b.c.0/24]    find TVs with network ADB (port 5555) on this Wi-Fi
  connect [ip[:port]]      connect, wait for the on-TV "Allow debugging" prompt
  status                   model, Android version, home app, backup in use
  backup                   snapshot packages, settings, home app; writes restore.sh
  debloat                  disable ads/telemetry/junk; asks about each optional app
  tweaks                   faster UI animations (reversible)
  launcher [--apk FILE]    install the minimal launcher and make it the home app
  dock                     choose and order the dock apps
  wallpapers DIR           push extra JPEG/PNG wallpapers to the launcher
  screenshot [label]       capture the TV screen
  restore [BACKUP_DIR]     undo everything (same as BACKUP_DIR/restore.sh)

Env: TV_SERIAL=ip:5555 to pick a device, ASSUME_YES=1 to accept safe defaults.
EOF
}

# ================================================================ discover

local_prefixes() {
  # Emit "a.b.c" for every private IPv4 interface address. /24 keeps a scan
  # under ~5 s with 64 parallel probes; pass a CIDR for anything else.
  if command -v ip >/dev/null 2>&1; then
    ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
  else
    ifconfig 2>/dev/null | awk '/inet /{print $2}' | sed 's/^addr://'
  fi | { grep -E '^(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.' || true; } | cut -d. -f1-3 | sort -u
}

probe_cmd() {
  # Prints a command template that exits 0 if TCP {} 5555 accepts a connection.
  if command -v nc >/dev/null 2>&1; then
    if [[ "$(uname)" == Darwin ]]; then echo 'nc -z -G 1 -w 1 {} 5555'; else echo 'nc -z -w 1 {} 5555'; fi
  else
    # Pure-bash fallback; the subshell is killed after 1 s by the watchdog.
    echo 'bash -c "exec 3<>/dev/tcp/{}/5555" & p=$!; (sleep 1; kill $p 2>/dev/null) & wait $p'
  fi
}

cmd_discover() {
  require_adb
  local prefixes cmd found=()
  if [[ $# -gt 0 ]]; then
    [[ "$1" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\.0/24$ ]] || die "Only a.b.c.0/24 is supported, got '$1'."
    prefixes="${BASH_REMATCH[1]}"
  else
    prefixes="$(local_prefixes)"
  fi
  [[ -n "${prefixes}" ]] || die "No private IPv4 address found. Is this computer on the same Wi-Fi as the TV?"
  cmd="$(probe_cmd)"

  info "Scanning $(echo "${prefixes}" | sed 's/$/.0\/24/' | tr '\n' ' ')for ADB on port 5555"
  local host
  while IFS= read -r host; do found+=("${host}"); done < <(
    for p in ${prefixes}; do for i in $(seq 1 254); do echo "${p}.${i}"; done; done \
      | xargs -P 64 -I{} sh -c "${cmd} >/dev/null 2>&1 && echo {}" | sort -t. -k4 -n
  )

  # Android 11+ "Wireless debugging" advertises over mDNS with a random port.
  local mdns
  mdns="$("${ADB}" mdns services 2>/dev/null | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]+' || true)"
  [[ -n "${mdns}" ]] && while IFS= read -r host; do found+=("${host}"); done <<<"${mdns}"

  if [[ ${#found[@]} -eq 0 ]]; then
    warn "Nothing found. On the TV: Settings > System > About > tap 'Android TV OS build' 7x,"
    warn "then Settings > System > Developer options > USB debugging ON (and 'Network debugging' if listed)."
    return 1
  fi
  ok "Found ${#found[@]} candidate(s):"
  printf '   %s\n' "${found[@]}"
  printf '%s\n' "${found[@]}" >"${STATE_DIR}/discovered"
}

# ================================================================ connect

cmd_connect() {
  require_adb
  local target="${1:-}"
  if [[ -z "${target}" ]]; then
    [[ -s "${STATE_DIR}/discovered" ]] || cmd_discover
    local n; n="$(wc -l <"${STATE_DIR}/discovered" | tr -d ' ')"
    if [[ "${n}" == 1 ]]; then target="$(<"${STATE_DIR}/discovered")"
    else
      nl -w3 -s') ' "${STATE_DIR}/discovered"
      local pick; read -r -p "Which TV? [1-${n}] " pick </dev/tty
      target="$(sed -n "${pick}p" "${STATE_DIR}/discovered")"
      [[ -n "${target}" ]] || die "Invalid choice."
    fi
  fi
  [[ "${target}" == *:* ]] || target="${target}:5555"

  info "Connecting to ${target}. Look at the TV and choose 'Always allow from this computer' > OK."
  "${ADB}" connect "${target}" >/dev/null 2>&1 || true
  local state='' i
  for i in $(seq 1 60); do
    state="$("${ADB}" -s "${target}" get-state 2>/dev/null || true)"
    [[ "${state}" == device ]] && break
    # 'unauthorized' means the prompt is up; 'offline' needs a re-connect.
    [[ "${state}" == unauthorized ]] || "${ADB}" connect "${target}" >/dev/null 2>&1 || true
    sleep 2
  done
  [[ "${state}" == device ]] || die "Not authorised after 2 min (state: ${state:-none})."
  TV_SERIAL="${target}"
  echo "${TV_SERIAL}" >"${STATE_DIR}/serial"
  ok "Connected: $(tvsh getprop ro.product.manufacturer) $(tvsh getprop ro.product.model), Android $(tvsh getprop ro.build.version.release) (SDK $(sdk_int))"
  SHOT_DIR="${STATE_DIR}/screenshots" screenshot connected
}

# ================================================================ status

cmd_status() {
  require_device
  echo "Device   : ${TV_SERIAL}"
  echo "Model    : $(tvsh getprop ro.product.manufacturer) $(tvsh getprop ro.product.model)"
  echo "Android  : $(tvsh getprop ro.build.version.release) (SDK $(sdk_int))"
  echo "Home app : $(current_home)"
  echo "Disabled : $(tvsh pm list packages -d | grep -c . || true) packages"
  echo "Backup   : $(latest_backup || echo none)"
  [[ -n "$(latest_backup || true)" ]] && echo "Changes  : $(wc -l <"$(latest_backup)/changes.tsv" | tr -d ' ') recorded"
  return 0
}

# ================================================================ backup

cmd_backup() {
  require_device
  local existing; existing="$(latest_backup || true)"
  if [[ -n "${existing}" && -s "${existing}/changes.tsv" && "$(<"${existing}/serial")" == "${TV_SERIAL}" ]]; then
    warn "Backup ${existing} already holds $(wc -l <"${existing}/changes.tsv" | tr -d ' ') changes for this TV."
    warn "A new backup would treat the current (modified) state as the baseline."
    ask "Keep using the existing backup?" y && { ok "Using ${existing}"; return 0; }
  fi

  local model ts dir
  model="$(tvsh getprop ro.product.model | tr -c 'A-Za-z0-9._-' '_' | sed 's/_*$//')"
  ts="$(date +%Y%m%d-%H%M%S)"
  dir="${BACKUP_ROOT}/${model:-tv}-${ts}"
  mkdir -p "${dir}/screenshots"
  info "Backing up to ${dir}"

  echo "${TV_SERIAL}"                          >"${dir}/serial"
  tvsh getprop                                 >"${dir}/props.txt"
  tvsh pm list packages -u                     >"${dir}/packages-all.txt"
  tvsh pm list packages -e                     >"${dir}/packages-enabled.txt"
  tvsh pm list packages -d                     >"${dir}/packages-disabled.txt"
  tvsh pm list packages -3                     >"${dir}/packages-thirdparty.txt"
  tvsh pm list packages -f                     >"${dir}/packages-apk-paths.txt"
  local ns
  for ns in global secure system; do tvsh settings list "${ns}" >"${dir}/settings-${ns}.txt" 2>/dev/null || true; done
  current_home                                 >"${dir}/home.txt"
  : >"${dir}/changes.tsv"
  cp "${ROOT_DIR}/lib/restore-template.sh" "${dir}/restore.sh"
  chmod +x "${dir}/restore.sh"

  local n_en n_all
  n_en="$(grep -c . "${dir}/packages-enabled.txt" || true)"
  n_all="$(grep -c . "${dir}/packages-all.txt" || true)"
  [[ "${n_en}" -gt 0 ]] || die "Package list came back empty; backup is not trustworthy."

  echo "${dir}" >"${STATE_DIR}/last_backup"
  SHOT_DIR="${dir}/screenshots"
  home_and_screenshot 00-before
  ok "Backup complete: ${n_en}/${n_all} packages enabled, home = $(<"${dir}/home.txt")"
  ok "Restore at any time: ${dir}/restore.sh"
}

# ================================================================ debloat

catalog_entries() {
  # category<TAB>package<TAB>description, comments stripped.
  cat "${CATALOG_DIR}"/*.tsv | grep -vE '^[[:space:]]*(#|$)' | awk -F'\t' 'NF>=3'
}

# Prompt with [y]es / [n]o / [e]ach; echo the choice letter.
choose_batch() {
  local q="$1" reply
  if [[ "${ASSUME_YES:-0}" == 1 ]]; then echo y; return; fi
  read -r -p "${q} [Y]es all / [n]o / [e]ach " reply </dev/tty || reply=''
  case "${reply:-y}" in [Nn]*) echo n ;; [Ee]*) echo e ;; *) echo y ;; esac
}

# Detect a crash/ANR dialog left on screen by a disabled dependency.
error_dialog_visible() {
  # Capture first: `grep -q` exiting early would SIGPIPE adb and fail under pipefail.
  local dump; dump="$(tvsh dumpsys window windows 2>/dev/null || true)"
  grep -qE 'Application (Error|Not Responding)|isn.t responding|has stopped' <<<"${dump}"
}

# Disable a list of packages, screenshot, and roll the batch back if the
# system shows a crash dialog afterwards.
disable_batch() {
  local label="$1"; shift
  local done_pkgs=() p
  for p in "$@"; do disable_pkg "${p}" && done_pkgs+=("${p}") || true; done
  [[ ${#done_pkgs[@]} -gt 0 ]] || return 0
  home_and_screenshot "after-${label}"
  if error_dialog_visible; then
    warn "A crash/ANR dialog appeared after disabling: ${done_pkgs[*]}"
    if ask "Re-enable this batch now?" y; then
      for p in "${done_pkgs[@]}"; do enable_pkg "${p}"; record_change pkg "${p}" disabled enabled; done
      adbs shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
      home_and_screenshot "rollback-${label}"
    fi
  fi
}

cmd_debloat() {
  require_device
  require_backup
  refresh_pkg_cache
  local entries; entries="$(catalog_entries)"

  local cat pkgs desc pkg choice
  for cat in ads telemetry junk; do
    pkgs=()
    info "Category: ${cat}"
    while IFS=$'\t' read -r c pkg desc; do
      [[ "${c}" == "${cat}" ]] || continue
      [[ "$(pkg_state "${pkg}")" == enabled ]] || continue
      is_protected "${pkg}" && continue
      pkgs+=("${pkg}")
      printf '   %-48s %s\n' "${pkg}" "${desc}"
    done <<<"${entries}"
    if [[ ${#pkgs[@]} -eq 0 ]]; then ok "No enabled ${cat} packages."; continue; fi
    choice="$(choose_batch "Disable these ${#pkgs[@]} ${cat} package(s)?")"
    case "${choice}" in
      y) disable_batch "${cat}" "${pkgs[@]}" ;;
      e)
        local picked=()
        for pkg in "${pkgs[@]}"; do ask "  Disable ${pkg}?" y && picked+=("${pkg}"); done
        [[ ${#picked[@]} -gt 0 ]] && disable_batch "${cat}" "${picked[@]}"
        ;;
      n) info "Skipped ${cat}." ;;
    esac
  done

  info "Optional apps and features. Default is KEEP; answer y only for things you never use."
  local optional=()
  while IFS=$'\t' read -r c pkg desc; do
    [[ "${c}" == ask ]] || continue
    [[ "$(pkg_state "${pkg}")" == enabled ]] || continue
    is_protected "${pkg}" && continue
    ask "  Disable ${pkg} - ${desc}?" n && optional+=("${pkg}")
  done <<<"${entries}"
  [[ ${#optional[@]} -gt 0 ]] && disable_batch optional "${optional[@]}"

  # Vendor system packages the catalogue does not know about: listed for
  # review only, because a wrong guess here is how TVs lose their tuner or HDMI input.
  local known uncat
  known="$(cut -f2 <<<"${entries}")"
  uncat="$(sed 's/^package://' <<<"${PKG_ALL}" \
    | grep -E '^(com\.(tcl|sony|xiaomi|mitv|miui|hisense|skyworth|toshiba|sharp|nvidia|amazon|philips|tpvision|mediatek\.wwtv)|org\.droidtv)\.' \
    | grep -vxF -f <(printf '%s\n' "${known}") || true)"
  if [[ -n "${uncat}" ]]; then
    echo "${uncat}" >"${BACKUP_DIR}/uncatalogued-vendor-packages.txt"
    info "$(grep -c . <<<"${uncat}") vendor packages are not in the catalogue and were left alone:"
    info "  ${BACKUP_DIR}/uncatalogued-vendor-packages.txt"
  fi

  refresh_pkg_cache
  ok "Debloat done. $(grep -c . <<<"${PKG_DISABLED}" || true) packages disabled in total. Undo: ${BACKUP_DIR}/restore.sh"
}

# ================================================================ tweaks

put_setting() {
  local ns="$1" key="$2" val="$3" prev
  prev="$(tvsh settings get "${ns}" "${key}")"
  [[ "${prev}" == "${val}" ]] && { ok "${ns}/${key} already ${val}"; return; }
  record_change setting "${ns}/${key}" "${prev:-null}" "${val}"
  tvsh settings put "${ns}" "${key}" "${val}" >/dev/null
  ok "${ns}/${key}: ${prev:-null} -> ${val}"
}

cmd_tweaks() {
  require_device
  require_backup
  if ask "Halve UI animation durations (menus feel ~2x snappier, no functional change)?" y; then
    put_setting global window_animation_scale 0.5
    put_setting global transition_animation_scale 0.5
    put_setting global animator_duration_scale 0.5
  fi
  home_and_screenshot after-tweaks
}

# ================================================================ launcher

find_apk() {
  local c
  for c in \
    "${ROOT_DIR}/dist/minimal-tv-home.apk" \
    "${ROOT_DIR}/launcher/app/build/outputs/apk/release/app-release.apk" \
    "${ROOT_DIR}/launcher/app/build/outputs/apk/debug/app-debug.apk"; do
    [[ -f "${c}" ]] && { echo "${c}"; return 0; }
  done
  if [[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ]]; then
    info "Building launcher with Gradle (first build downloads dependencies)" >&2
    (cd "${ROOT_DIR}/launcher" && ./gradlew --quiet assembleRelease) >&2
    c="${ROOT_DIR}/launcher/app/build/outputs/apk/release/app-release.apk"
    [[ -f "${c}" ]] && { echo "${c}"; return 0; }
  fi
  return 1
}

cmd_launcher() {
  require_device
  require_backup
  local apk=''
  if [[ "${1:-}" == --apk ]]; then apk="${2:?--apk needs a file}"; fi
  [[ -n "${apk}" ]] || apk="$(find_apk)" || die "No launcher APK. Either install the Android SDK (ANDROID_HOME) so it can be built,
or download 'minimal-tv-home' from the repo's Actions tab and run: ./tv.sh launcher --apk path/to/minimal-tv-home.apk"
  [[ -f "${apk}" ]] || die "APK not found: ${apk}"

  local sdk; sdk="$(sdk_int)"
  [[ "${sdk}" -ge 24 ]] || die "Android SDK ${sdk} < 24: set-home-activity is unavailable. Install the APK and pick it when pressing HOME."

  refresh_pkg_cache
  local was; was="$(pkg_state "${LAUNCHER_PKG}")"
  [[ "${was}" == absent ]] || was=present
  record_change install "${LAUNCHER_PKG}" "${was}" present
  info "Installing $(basename "${apk}")"
  adbs install -r "${apk}" | tail -1

  local prev; prev="$(current_home)"
  record_change home - "${prev:-null}" "${LAUNCHER_ACTIVITY}"
  local out; out="$(tvsh cmd package set-home-activity --user 0 "${LAUNCHER_ACTIVITY}" 2>&1 || true)"
  [[ "${out}" == *Success* ]] || warn "set-home-activity said: ${out}"

  home_and_screenshot launcher
  if [[ "$(resumed_component)" == ${LAUNCHER_PKG}/* ]]; then
    ok "Minimal launcher is the home screen."
  else
    warn "HOME still opens $(resumed_component). Google TV and some OEM builds hard-wire the HOME key to the stock launcher."
    local stock=() c pkg desc
    while IFS=$'\t' read -r c pkg desc; do
      [[ "${c}" == launcher && "$(pkg_state "${pkg}")" == enabled ]] && stock+=("${pkg}")
    done < <(catalog_entries)
    if [[ ${#stock[@]} -gt 0 ]] && ask "Disable the stock launcher (${stock[*]}) so HOME uses the new one? restore.sh re-enables it." n; then
      local p; for p in "${stock[@]}"; do disable_pkg "${p}" || true; done
      tvsh cmd package set-home-activity --user 0 "${LAUNCHER_ACTIVITY}" >/dev/null 2>&1 || true
      home_and_screenshot launcher-stock-disabled
      if [[ "$(resumed_component)" != ${LAUNCHER_PKG}/* ]]; then
        warn "Still not showing the new launcher; re-enabling the stock launcher to stay safe."
        for p in "${stock[@]}"; do enable_pkg "${p}"; record_change pkg "${p}" disabled enabled; done
        home_and_screenshot launcher-rollback
      else
        ok "Minimal launcher is the home screen."
      fi
    else
      info "The launcher is installed and opens from the app list; HOME keeps the stock launcher."
    fi
  fi
}

# ================================================================ dock

# Friendly names for common TV apps; anything else is shown by package name.
app_name() {
  case "$1" in
    com.netflix.ninja) echo Netflix ;;
    com.google.android.youtube.tv) echo YouTube ;;
    com.google.android.youtube.tvkids) echo "YouTube Kids" ;;
    com.google.android.youtube.tvmusic) echo "YouTube Music" ;;
    com.amazon.amazonvideo.livingroom) echo "Prime Video" ;;
    com.disney.disneyplus) echo "Disney+" ;;
    com.wbd.stream|com.hbo.hbonow) echo Max ;;
    com.hulu.livingroomplus) echo Hulu ;;
    com.apple.atve.androidtv.appletv) echo "Apple TV" ;;
    com.plexapp.android) echo Plex ;;
    org.jellyfin.androidtv) echo Jellyfin ;;
    org.xbmc.kodi) echo Kodi ;;
    com.spotify.tv.android) echo Spotify ;;
    tv.twitch.android.app) echo Twitch ;;
    com.android.vending) echo "Play Store" ;;
    com.android.tv.settings|com.google.android.tvsettings) echo Settings ;;
    com.google.android.videos) echo "Google TV" ;;
    com.peacocktv.peacockandroid) echo Peacock ;;
    com.cbs.ott) echo "Paramount+" ;;
    *) echo "$1" ;;
  esac
}

cmd_dock() {
  require_device
  local apps
  apps="$(tvsh cmd package query-activities --brief --user 0 -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER 2>/dev/null \
    | grep -oE '^[[:space:]]*[A-Za-z0-9_.]+/' | tr -d ' /' | grep -vx "${LAUNCHER_PKG}" | sort -u)"
  [[ -n "${apps}" ]] || die "Could not list TV apps (needs Android 7+)."
  local i=0 p
  while IFS= read -r p; do i=$((i + 1)); printf '%3d) %-22s %s\n' "${i}" "$(app_name "${p}")" "${p}"; done <<<"${apps}"
  local picks
  read -r -p "Dock apps in order, e.g. '3 1 7' (Enter = launcher's automatic pick): " picks </dev/tty || picks=''
  [[ -n "${picks}" ]] || { info "Dock unchanged."; return 0; }

  local tmp; tmp="$(mktemp)"
  local n
  for n in ${picks}; do
    [[ "${n}" =~ ^[0-9]+$ ]] || die "Not a number: ${n}"
    p="$(sed -n "${n}p" <<<"${apps}")"
    [[ -n "${p}" ]] || die "No app #${n}"
    echo "${p}" >>"${tmp}"
  done
  local dest="/sdcard/Android/data/${LAUNCHER_PKG}/files"
  adbs shell mkdir -p "${dest}" >/dev/null
  adbs push "${tmp}" "${dest}/dock.txt" >/dev/null
  rm -f "${tmp}"
  ok "Dock saved: $(while IFS= read -r p; do printf '%s, ' "$(app_name "${p}")"; done < <(adbs shell cat "${dest}/dock.txt" | tr -d '\r') | sed 's/, $//')"
  # Restart so the launcher re-reads dock.txt immediately.
  adbs shell am force-stop "${LAUNCHER_PKG}" >/dev/null 2>&1 || true
  use_backup_shot_dir
  home_and_screenshot dock
}

# ================================================================ wallpapers

cmd_wallpapers() {
  require_device
  local src="${1:?Usage: ./tv.sh wallpapers DIR}"
  [[ -d "${src}" ]] || die "Not a directory: ${src}"
  local dest="/sdcard/Android/data/${LAUNCHER_PKG}/files/wallpapers" f n=0
  adbs shell mkdir -p "${dest}" >/dev/null
  for f in "${src}"/*; do
    case "$(tr '[:upper:]' '[:lower:]' <<<"${f}")" in *.jpg|*.jpeg|*.png|*.webp) ;; *) continue ;; esac
    adbs push "${f}" "${dest}/" >/dev/null && n=$((n + 1))
  done
  ok "Pushed ${n} wallpaper(s). They join the rotation on the next change."
}

# ================================================================ restore

cmd_restore() {
  local dir="${1:-$(latest_backup || true)}"
  [[ -n "${dir}" && -x "${dir}/restore.sh" ]] || die "No backup with restore.sh found${1:+ at $1}."
  ask "Restore the TV to the state saved in ${dir}?" n || return 0
  "${dir}/restore.sh" ${TV_SERIAL:+"${TV_SERIAL}"}
  TV_SERIAL="${TV_SERIAL:-$(<"${dir}/serial")}"
  SHOT_DIR="${dir}/screenshots" home_and_screenshot after-restore
}

cmd_screenshot() {
  require_device
  use_backup_shot_dir
  screenshot "${1:-manual}"
}

cmd_all() {
  [[ -n "${TV_SERIAL:-}" || -s "${STATE_DIR}/serial" ]] || cmd_connect
  cmd_backup
  cmd_debloat
  cmd_tweaks
  cmd_launcher "$@"
  cmd_dock
  cmd_status
}

case "${1:-help}" in
  all)        shift; cmd_all "$@" ;;
  discover)   shift; cmd_discover "$@" ;;
  connect)    shift; cmd_connect "$@" ;;
  status)     cmd_status ;;
  backup)     cmd_backup ;;
  debloat)    cmd_debloat ;;
  tweaks)     cmd_tweaks ;;
  launcher)   shift; cmd_launcher "$@" ;;
  dock)       cmd_dock ;;
  wallpapers) shift; cmd_wallpapers "$@" ;;
  screenshot) shift; cmd_screenshot "$@" ;;
  restore)    shift; cmd_restore "$@" ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
