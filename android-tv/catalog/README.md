# Package catalogue

One file per vendor; all files are merged at run time and only packages
**installed and currently enabled** on the TV are offered, so an entry for
another brand is inert.

Format (tab-separated, `#` comments):

```
category<TAB>package<TAB>description
```

| Category | Behaviour in `./tv.sh debloat` |
|---|---|
| `ads` | Listed as a batch, default **yes**. Ad/promo delivery only. |
| `telemetry` | Listed as a batch, default **yes**. Usage stats, crash/feedback upload. |
| `junk` | Listed as a batch, default **yes**. Features a TV cannot use (printing, partner bookmarks). |
| `ask` | Asked one by one, default **no**. Apps and features you might use. |
| `launcher` | Never touched by `debloat`; offered only by `./tv.sh launcher` after the new home screen is verified. |

Anything matching `PROTECTED_RE` in `lib/common.sh` (Play Services, Settings,
remote/Bluetooth stack, IME, setup wizard, OTA) is refused even if listed here.
Package names below are best-effort per model generation; if your TV ships an
ad or telemetry package that is missing, add a line and open a PR.
