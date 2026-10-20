# shellcheck shell=bash
# shellcheck disable=SC2034  # variables are consumed by tv.sh
# Shared helpers for tv.sh. Sourced, never executed directly.
#
# Invariants every command relies on:
#   * Every device mutation goes through record_* first, so the generated
#     restore script can undo it even if the run is interrupted.
#   * Packages are only ever disabled for user 0 (`pm disable-user`), never
#     uninstalled. The APK and its data stay on the system partition.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/.state"
BACKUP_ROOT="${ROOT_DIR}/backups"
CATALOG_DIR="${ROOT_DIR}/catalog"
LAUNCHER_PKG="dev.minimal.tvhome"
LAUNCHER_ACTIVITY="${LAUNCHER_PKG}/.HomeActivity"
ADB="${ADB:-adb}"

mkdir -p "${STATE_DIR}" "${BACKUP_ROOT}"

# ---------------------------------------------------------------- output

if [[ -t 1 ]]; then
  C_RED=$'\e[31m'; C_GRN=$'\e[32m'; C_YLW=$'\e[33m'; C_BLU=$'\e[34m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'
else
  C_RED=''; C_GRN=''; C_YLW=''; C_BLU=''; C_DIM=''; C_OFF=''
fi

info() { printf '%s==>%s %s\n' "${C_BLU}" "${C_OFF}" "$*"; }
ok()   { printf '%s ok%s %s\n' "${C_GRN}" "${C_OFF}" "$*"; }
warn() { printf '%s !!%s %s\n' "${C_YLW}" "${C_OFF}" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "${C_RED}" "${C_OFF}" "$*" >&2; exit 1; }

# ask "question" default(y|n) -> returns 0 for yes. ASSUME_YES=1 auto-accepts
# only questions whose default is yes; risky questions default to no.
ask() {
  local q="$1" def="${2:-n}" reply hint
  [[ "${def}" == y ]] && hint='[Y/n]' || hint='[y/N]'
  if [[ "${ASSUME_YES:-0}" == 1 ]]; then
    printf '%s %s %s\n' "${q}" "${hint}" "(auto: ${def})"
    [[ "${def}" == y ]]; return
  fi
  read -r -p "${q} ${hint} " reply </dev/tty || reply=''
  reply="${reply:-${def}}"
  [[ "${reply}" =~ ^[Yy] ]]
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found. $2"; }

# ---------------------------------------------------------------- adb

require_adb() {
  require_cmd "${ADB}" "Install Android platform-tools: macOS 'brew install android-platform-tools', Debian/Ubuntu 'sudo apt install adb', Windows 'winget install Google.PlatformTools'."
}

# Resolve the target serial: $TV_SERIAL > saved state > the single connected device.
resolve_serial() {
  if [[ -n "${TV_SERIAL:-}" ]]; then return; fi
  if [[ -s "${STATE_DIR}/serial" ]]; then TV_SERIAL="$(<"${STATE_DIR}/serial")"; return; fi
  # bash 3.2 (macOS default) has no mapfile.
  local devices=() d
  while IFS= read -r d; do devices+=("${d}"); done \
    < <("${ADB}" devices | awk 'NR>1 && $2=="device"{print $1}')
  case "${#devices[@]}" in
    0) die "No TV connected. Run: ./tv.sh connect" ;;
    1) TV_SERIAL="${devices[0]}" ;;
    *) die "Several devices connected (${devices[*]}). Set TV_SERIAL=<serial>." ;;
  esac
}

# </dev/null: adb shell otherwise swallows the stdin of any enclosing read loop.
adbs() { "${ADB}" -s "${TV_SERIAL}" "$@" </dev/null; }

# Run a device shell command and strip the CR that older adbd builds emit.
tvsh() { adbs shell "$@" | tr -d '\r'; }

require_device() {
  require_adb
  resolve_serial
  local state
  state="$("${ADB}" -s "${TV_SERIAL}" get-state 2>/dev/null || true)"
  if [[ "${state}" != device ]]; then
    # Network adb drops after the TV sleeps; one reconnect attempt is cheap.
    if [[ "${TV_SERIAL}" == *:* ]]; then "${ADB}" connect "${TV_SERIAL}" >/dev/null 2>&1 || true; sleep 1; fi
    state="$("${ADB}" -s "${TV_SERIAL}" get-state 2>/dev/null || true)"
    [[ "${state}" == device ]] || die "TV ${TV_SERIAL} is '${state:-offline}'. Accept the USB-debugging prompt on the TV, then ./tv.sh connect."
  fi
}

sdk_int() { tvsh getprop ro.build.version.sdk; }

# ---------------------------------------------------------------- backups

# Most recent backup directory, or empty.
latest_backup() {
  [[ -s "${STATE_DIR}/last_backup" ]] && cat "${STATE_DIR}/last_backup"
}

require_backup() {
  BACKUP_DIR="$(latest_backup || true)"
  [[ -n "${BACKUP_DIR}" && -d "${BACKUP_DIR}" ]] || die "No backup found. Run ./tv.sh backup first."
  [[ "$(<"${BACKUP_DIR}/serial")" == "${TV_SERIAL}" ]] \
    || warn "Latest backup is for $(<"${BACKUP_DIR}/serial"), not ${TV_SERIAL}."
  CHANGES="${BACKUP_DIR}/changes.tsv"
  SHOT_DIR="${BACKUP_DIR}/screenshots"
  mkdir -p "${SHOT_DIR}"
  touch "${CHANGES}"
}

# changes.tsv columns: kind <TAB> key <TAB> previous value <TAB> new value
#   pkg      <package>          enabled|disabled      disabled
#   setting  <ns>/<key>         <old or 'null'>       <new>
#   home     -                  <component or 'null'> <component>
#   install  <package>          absent|present        present
record_change() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"${CHANGES}"
}

# ---------------------------------------------------------------- screenshots

# Capture the TV screen into the active backup's screenshot folder and print
# the path. Validates the PNG signature: on DRM-protected surfaces or some
# vendor builds screencap returns an empty or black buffer.
screenshot() {
  local label="$1" dir="${SHOT_DIR:-${STATE_DIR}/screenshots}" file
  mkdir -p "${dir}"
  file="${dir}/$(date +%Y%m%d-%H%M%S)-${label}.png"
  if adbs exec-out screencap -p >"${file}" 2>/dev/null \
      && [[ "$(head -c 8 "${file}" | od -An -tx1 | tr -d ' \n')" == 89504e470d0a1a0a ]]; then
    printf '%s screenshot%s %s\n' "${C_DIM}" "${C_OFF}" "${file}"
  else
    rm -f "${file}"
    warn "Screenshot '${label}' failed (screen off or protected content)."
  fi
}

# Point screenshots at the latest backup's folder, or .state/ before any backup exists.
use_backup_shot_dir() {
  local b; b="$(latest_backup || true)"
  if [[ -n "${b}" ]]; then SHOT_DIR="${b}/screenshots"; else SHOT_DIR="${STATE_DIR}/screenshots"; fi
}

# Go to the home screen and give the launcher time to draw before capturing.
home_and_screenshot() {
  adbs shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adbs shell input keyevent KEYCODE_HOME >/dev/null 2>&1 || true
  sleep "${SETTLE_SECONDS:-3}"
  screenshot "$1"
}

# ---------------------------------------------------------------- packages

# Packages that must never be disabled regardless of catalogue contents:
# disabling any of these can leave the TV without input, settings or boot UI.
PROTECTED_RE='^(android|com\.android\.(systemui|settings|tv\.settings|providers\..*|packageinstaller|permissioncontroller|shell|inputdevices|externalstorage|bluetooth|phone|server\..*|networkstack.*|webview)|com\.google\.android\.(gms|gsf|gsf\.login|tvsettings|tv\.remote\.service|packageinstaller|permissioncontroller|webview|ext\..*|tungsten\.setupwraith|apps\.tv\.setupwraith|setupwraith|leanbackime|inputmethod\..*|tts|tv\.frameworkpackagestubs|configupdater|modulemetadata)|com\.amazon\.(device\.software\.ota.*|tv\.settings.*|tv\.oobe)|dev\.minimal\.tvhome)$'

is_protected() { [[ "$1" =~ ${PROTECTED_RE} ]]; }

# Current state of a package for user 0: enabled | disabled | absent.
pkg_state() {
  local p="$1"
  if ! grep -qxF "package:${p}" <<<"${PKG_ALL}"; then echo absent
  elif grep -qxF "package:${p}" <<<"${PKG_DISABLED}"; then echo disabled
  else echo enabled
  fi
}

refresh_pkg_cache() {
  PKG_ALL="$(tvsh pm list packages)"
  PKG_DISABLED="$(tvsh pm list packages -d)"
}

# Disable for user 0 and verify. Returns non-zero (without exiting) on refusal,
# which happens on Fire OS and some OEM builds for privileged packages.
disable_pkg() {
  local p="$1" out
  is_protected "${p}" && { warn "Refusing to disable protected package ${p}"; return 1; }
  record_change pkg "${p}" enabled disabled
  out="$(tvsh pm disable-user --user 0 "${p}" 2>&1 || true)"
  if [[ "${out}" == *"new state: disabled"* ]]; then
    ok "disabled ${p}"
  else
    # Roll the journal line back so restore does not "re-enable" an untouched package.
    sed -i.bak '$d' "${CHANGES}" && rm -f "${CHANGES}.bak"
    warn "could not disable ${p}: ${out//$'\n'/ }"
    return 1
  fi
}

enable_pkg() {
  local p="$1" out
  out="$(tvsh pm enable --user 0 "${p}" 2>&1 || true)"
  if [[ "${out}" == *"new state: enabled"* || "${out}" == *"new state: default"* ]]; then ok "enabled ${p}"
  else warn "could not enable ${p}: ${out//$'\n'/ }"; fi
}

# Current HOME activity as package/class, or empty.
current_home() {
  local out
  out="$(tvsh cmd package resolve-activity --brief --user 0 \
      -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null || true)"
  awk '/\//{c=$NF} END{print c}' <<<"${out}"
}

# Foreground activity component, used to verify the launcher is really on screen.
resumed_component() {
  # Capture first: an early-exiting grep would SIGPIPE adb and fail under pipefail.
  local dump; dump="$(tvsh dumpsys activity activities 2>/dev/null || true)"
  awk '/mResumedActivity|topResumedActivity|ResumedActivity:/ {
         if (match($0, /[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+/)) { print substr($0, RSTART, RLENGTH); exit }
       }' <<<"${dump}"
}
