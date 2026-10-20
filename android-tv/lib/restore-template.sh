#!/usr/bin/env bash
# Standalone restore script, copied into every backup folder by `tv.sh backup`.
# Needs only `adb`. Undoes everything recorded in changes.tsv (newest first),
# then re-enables any package that was enabled at backup time but is disabled now.
#
# Usage:
#   ./restore.sh                 # TV serial from this backup (e.g. 192.168.1.40:5555)
#   ./restore.sh 192.168.1.77    # TV got a new IP address
#   ./restore.sh --keep-launcher # leave the minimal launcher installed (but not default)
#   ./restore.sh --dry-run       # print the adb commands without running them
set -Euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADB="${ADB:-adb}"
KEEP_LAUNCHER=0
DRY_RUN=0
SERIAL="$(cat "${HERE}/serial")"

for arg in "$@"; do
  case "${arg}" in
    --keep-launcher) KEEP_LAUNCHER=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) SERIAL="${arg}"; [[ "${SERIAL}" == *:* || "${SERIAL}" != *.*.*.* ]] || SERIAL="${SERIAL}:5555" ;;
  esac
done

command -v "${ADB}" >/dev/null || { echo "adb not found (install Android platform-tools)" >&2; exit 1; }

run() {
  if [[ "${DRY_RUN}" == 1 ]]; then printf 'adb -s %s shell %s\n' "${SERIAL}" "$*"; return 0; fi
  # </dev/null: adb shell otherwise consumes the stdin of the enclosing read loop.
  "${ADB}" -s "${SERIAL}" shell "$@" </dev/null 2>&1 | tr -d '\r'
}

if [[ "${DRY_RUN}" != 1 ]]; then
  [[ "${SERIAL}" == *:* ]] && "${ADB}" connect "${SERIAL}" >/dev/null 2>&1
  state="$("${ADB}" -s "${SERIAL}" get-state 2>/dev/null || true)"
  [[ "${state}" == device ]] || { echo "TV ${SERIAL} not reachable (${state:-offline}). Is network debugging on and the prompt accepted?" >&2; exit 1; }
fi

echo "Restoring ${SERIAL} from ${HERE}"
uninstall_launcher=''

# Newest change first, so a value changed twice ends at its oldest recorded state.
if [[ -s "${HERE}/changes.tsv" ]]; then
  while IFS=$'\t' read -r kind key prev _new; do
    case "${kind}" in
      pkg)
        [[ "${prev}" == enabled ]] && { echo "enable  ${key}"; run pm enable --user 0 "${key}" >/dev/null; } ;;
      setting)
        ns="${key%%/*}"; name="${key#*/}"
        if [[ "${prev}" == null ]]; then echo "delete  ${key}"; run settings delete "${ns}" "${name}" >/dev/null
        else echo "set     ${key}=${prev}"; run settings put "${ns}" "${name}" "${prev}" >/dev/null; fi ;;
      home)
        if [[ "${prev}" != null && -n "${prev}" ]]; then
          echo "home    ${prev}"; run cmd package set-home-activity --user 0 "${prev}" >/dev/null
        fi ;;
      install)
        [[ "${prev}" == absent ]] && uninstall_launcher="${key}" ;;
    esac
  done < <(awk '{l[NR]=$0} END{for(i=NR;i>0;i--)print l[i]}' "${HERE}/changes.tsv")
fi

# Safety sweep: anything enabled at backup time must be enabled again.
if [[ "${DRY_RUN}" != 1 ]]; then
  disabled_now="$(run pm list packages -d | sed 's/^package://')"
  while IFS= read -r p; do
    [[ -z "${p}" ]] && continue
    if grep -qxF "${p}" <<<"${disabled_now}"; then echo "enable  ${p} (sweep)"; run pm enable --user 0 "${p}" >/dev/null; fi
  done < <(sed 's/^package://' "${HERE}/packages-enabled.txt")
fi

if [[ -n "${uninstall_launcher}" && "${KEEP_LAUNCHER}" != 1 ]]; then
  echo "remove  ${uninstall_launcher} (installed by tv.sh; pass --keep-launcher to keep)"
  if [[ "${DRY_RUN}" == 1 ]]; then echo "adb -s ${SERIAL} uninstall ${uninstall_launcher}"
  else "${ADB}" -s "${SERIAL}" uninstall "${uninstall_launcher}" </dev/null >/dev/null 2>&1 || true; fi
fi

run input keyevent KEYCODE_HOME >/dev/null
echo "Done. If the old home screen does not appear, reboot the TV: adb -s ${SERIAL} reboot"
