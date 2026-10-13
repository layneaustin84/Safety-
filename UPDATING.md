# Releasing CSP Drill updates

Every release, including the weekly question update, follows this procedure. Releases go through a pull request so a person checks answer keys before they reach the app: a wrong key teaches the wrong answer.

## 1. Branch

```sh
git fetch origin master
git checkout -B update/YYYY-MM-DD origin/master
```

## 2. Add questions (`csp-drill/questions.js`)

- Add **10 new questions** per weekly release. Prioritize the domains with the fewest questions (the validator prints per-domain counts), and keep at least 3 calculation items.
- Write every item from scratch. Never copy or paraphrase BCSP, examCORE, or any commercial question bank.
- Schema: `{ id, d, q, o, a, e, added }`.
  - `id`: domain prefix + the next unused number for that domain (`m` math, `g` mgmt, `r` risk, `e` ergo, `f` fire, `x` erm, `h` ih, `v` env, `t` train). Never renumber or reuse an id; progress is keyed on it.
  - `o`: exactly 4 plausible, distinct options with one unambiguous answer. Vary the correct index (the app shuffles display order, but keep the source balanced).
  - `e`: why the answer is correct; for calculations show the formula and the arithmetic.
  - `added`: the release date (equals `updated`), which makes the item appear under **New this update**.
- Accuracy rules:
  - Cite regulations by number (e.g., 29 CFR 1910.134) only when certain of the requirement.
  - Recompute every calculation independently before committing (e.g., with `node -e`).
  - Avoid items whose answer depends on a recently changed or jurisdiction-specific threshold unless the stem names the source.

## 3. Fix the app

Review open issues and anything noticed while testing; fix bugs in `csp-drill/index.html` in the same release. Keep changes minimal and describe each in `changes`.

## 4. Bump release metadata

- `questions.js`: `version` (minor for new questions, patch for fixes only), `updated` (today, YYYY-MM-DD), `changes` (short user-facing lines, e.g. "10 new questions: 4 Ergonomics, 3 Environmental, 3 Training.").
- `csp-drill/sw.js`: set `VERSION` to the same value. This is what triggers the in-app **Reload** banner.

## 5. Verify

```sh
node scripts/validate-questions.mjs
```

It must pass. Then open the PR against `master`; CI re-runs the validator. Merging deploys to GitHub Pages; installed apps pick up the update the next time they open online.
