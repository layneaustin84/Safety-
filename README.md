# Long Shadow

A browser sniper game in the style of *Sniper Elite*: a single hide on a ridge above an occupied Italian village, ballistic bullets, sound masking, and a slow-motion X-ray kill cam.

It is one self-contained file (`index.html`) that uses Three.js r128 from cdnjs. It runs on desktop and on phones.

## Run it

```bash
# Any static server works; opening the file directly also works.
npx http-server . -p 8080
# then open http://localhost:8080
```

To install it on a phone, host the folder (GitHub Pages works: Settings → Pages → deploy from branch), open it in the phone's browser, and use **Add to Home Screen**.

## Mechanics

| System | Implementation |
|---|---|
| Ballistics | Bullets are simulated at 240 Hz with gravity (600 m/s muzzle velocity, 100 m zero) and wind acceleration. Nothing is hitscan, so moving targets need lead. |
| Scope | 3× / 6× / 10×. The reticle's drop marks (2–7 = 200–700 m) are computed from the same ballistic model, so holdover is exact for the current zoom. |
| Sway / breath | Scope sway scales with heart rate. Holding breath cuts sway by 88% for up to 5 s. Running out of breath leaves you winded and doubles sway. |
| Range finder | Casts a ray from the reticle centre and reports the range at 10 Hz. |
| Hit zones | Head is a kill. Torso is a kill. Arms and legs wound, and the wounded soldier raises the alarm. |
| Stealth | A global alert meter rises from unmasked shots, bullets that land near soldiers, bodies they find, and kills they witness. At 100% the garrison goes to combat and returns fire. Take cover (**C**) to break contact; you also regain health while in cover. |
| Sound masking | Artillery barrages on the far hills arrive every 30–40 s. Shots fired during a barrage barely register. |
| Kill cam | Fires on lethal head shots, long shots (>140 m), the HVT, and the final kill. The shot is predicted against soldiers' extrapolated movement, the camera follows the bullet in slow motion, and an X-ray view shows the fracture on impact. Skip it with a click, Space, or Enter. |
| Scoring | Kill, headshot, long shot, moving target, sound-masked, unaware, and HVT bonuses. Winning adds accuracy and time bonuses. The best score is saved locally. |

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Aim | Mouse (pointer lock), or drag if pointer lock is blocked | Drag anywhere |
| Fire | Left click / Space / F | FIRE |
| Scope | Right click / Q | SCOPE |
| Zoom | Wheel / Z | ZOOM |
| Hold breath | Shift (hold) | BREATH (hold) |
| Reload | R | RELOAD |
| Tag target | T | TAG |
| Cover / peek | C | HIDE |
| Kill cam on/off | K | — |
| Pause | Esc / P | II |

## Difficulty

- **Recruit**: no wind; the red impact marker is always shown; enemies shoot less accurately.
- **Marksman**: light wind; the marker appears while you hold your breath.
- **Elite**: strong wind; no marker; enemies notice more and shoot more accurately.
