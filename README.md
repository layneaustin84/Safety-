# CSP Drill

Offline practice app for the Certified Safety Professional (CSP) exam: original questions across the nine CSP domains, a timed exam at real pace, a formula sheet with calculators, and per-domain progress tracking.

Independent study aid. Not affiliated with or endorsed by BCSP; no examCORE content is included.

## Install

The app is published by GitHub Pages at `https://layneaustin84.github.io/Safety-/` once Pages is enabled (see below). Open it online once; it then works with no connection.

| Device | Steps |
|---|---|
| iPhone / iPad | Open the URL in **Safari** → Share → **Add to Home Screen**. |
| Android | Open in **Chrome** → ⋮ → **Install app** (or **Add to Home screen**). |
| Windows / macOS / Linux | Open in **Chrome** or **Edge** → install icon in the address bar (or ⋮ → **Install CSP Drill**). |
| PC with no hosting at all | Download the repo ZIP, open `csp-drill/index.html` directly. Works fully except auto-updates. |

Progress is stored per device and per browser. Updates download in the background; a **Reload** banner appears when a new version is ready.

## One-time hosting setup

1. Merge the app into `master`.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The `Validate and deploy CSP Drill` workflow deploys on every push to `master`.

## Layout

```
csp-drill/
  index.html             app shell (UI, logic, styles)
  questions.js           question bank + release metadata (version, updated, changes)
  sw.js                  service worker (offline cache, update detection)
  manifest.webmanifest   install metadata
  icons/                 app icons
scripts/validate-questions.mjs   schema and integrity checks (run in CI)
.github/workflows/pages.yml      validate on PRs; validate + deploy on master
UPDATING.md                      release procedure, including the weekly question update
```

## Validate locally

```sh
node scripts/validate-questions.mjs
```

## Android TV toolkit

`android-tv/` holds a separate tool: reversible Android TV debloat scripts plus a minimal Apple TV-style launcher. See [`android-tv/README.md`](android-tv/README.md).
