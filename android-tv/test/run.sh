#!/usr/bin/env bash
# End-to-end test of tv.sh against a stateful fake adb (test/mock-adb):
# backup -> debloat -> tweaks -> launcher -> restore must return to the baseline.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

cp -R "${HERE}/.." "${WORK}/tv"
rm -rf "${WORK}/tv/backups" "${WORK}/tv/.state"
mkdir -p "${WORK}/tv/dist"
echo fake >"${WORK}/tv/dist/minimal-tv-home.apk"

export MOCK_DIR="${WORK}/device" ADB="${HERE}/mock-adb" ASSUME_YES=1 SETTLE_SECONDS=0
cd "${WORK}/tv"

fail() { echo "FAIL: $*" >&2; exit 1; }

./tv.sh connect 10.0.0.5 >/dev/null
./tv.sh backup >/dev/null
./tv.sh debloat >/dev/null
./tv.sh tweaks >/dev/null
./tv.sh launcher >/dev/null

backup="$(cat .state/last_backup)"
grep -qx 'com.google.android.feedback' "${MOCK_DIR}/disabled" || fail "telemetry package not disabled"
grep -qx 'com.google.android.katniss' "${MOCK_DIR}/disabled" && fail "optional package disabled without consent"
grep -qx 'com.google.android.gms' "${MOCK_DIR}/disabled" && fail "protected package disabled"
grep -qx 'com.tcl.secretthing' "${MOCK_DIR}/disabled" && fail "uncatalogued package disabled"
[[ "$(cat "${MOCK_DIR}/home")" == dev.minimal.tvhome/.HomeActivity ]] || fail "launcher not set as home"
[[ -f "${MOCK_DIR}/installed" ]] || fail "launcher not installed"
[[ "$(wc -l <"${backup}/changes.tsv")" -ge 5 ]] || fail "changes not journaled"

"${backup}/restore.sh" >/dev/null

[[ ! -s "${MOCK_DIR}/disabled" ]] || fail "packages still disabled after restore: $(tr '\n' ' ' <"${MOCK_DIR}/disabled")"
[[ "$(cat "${MOCK_DIR}/home")" == com.google.android.apps.tv.launcherx/.MainActivity ]] || fail "home not restored"
[[ ! -f "${MOCK_DIR}/installed" ]] || fail "launcher not removed"
tail -1 "${MOCK_DIR}/settings" | grep -q '=null$' || fail "settings not restored"
# The only uninstall ever issued may be our own launcher's.
if grep 'uninstall' "${MOCK_DIR}/log" | grep -qv dev.minimal.tvhome; then fail "a stock app was uninstalled"; fi

echo "PASS: backup/debloat/tweaks/launcher/restore round-trip"
