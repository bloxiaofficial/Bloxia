# Bloxia

A Roblox-style game platform built as a self-contained static web app. Bloxia includes a
storefront-style homepage, a game catalog, an avatar customizer, a marketplace with a
spendable currency ("Bux"), and a **fully playable 3D obby (parkour) game** that runs in the
browser using [Three.js](https://threejs.org/).

> Bloxia is an original, fan-made demo inspired by the *style* of Roblox. It does not use any
> Roblox trademarks, logos, code, or proprietary assets.

## Features

| Page | What it does |
|------|--------------|
| `index.html` | Homepage with hero, featured / popular / recommended carousels |
| `discover.html` | Searchable, genre-filterable game catalog |
| `avatar.html` | Live avatar editor (skin, shirt, pants, face, hat) saved to `localStorage` |
| `marketplace.html` | Buy cosmetic items with Bux; ownership persists |
| `game.html` | Loads any game; ships with a playable 3D obby tower |

### The 3D Obby Game
- Third-person blocky avatar that uses **your saved avatar colors**
- WASD + mouse-look + jump platforming over a rising course
- Moving platforms, spinning hazards, collectible coins, and checkpoints
- Timer, stage tracker, win screen, and **Bux rewards** on completion

### Controls
- **W A S D** — move
- **Space** — jump
- **Mouse** — look around (click the canvas to capture the cursor)
- **R** — respawn at last checkpoint

## State / persistence
All progress (Bux balance, owned items, avatar, likes) is stored in the browser via
`localStorage` under the `bloxia.state` key. No backend required.

## Running locally
It's pure static files — open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Tech
- Vanilla HTML / CSS / JavaScript (no build step)
- Three.js (r128) via CDN for the 3D game
- Emoji + CSS gradients for all art (no binary assets)

## Project structure
```
bloxia/
├── index.html          # Home
├── discover.html       # Game catalog
├── avatar.html         # Avatar editor
├── marketplace.html    # Item shop
├── game.html           # 3D game player
└── assets/
    ├── css/style.css
    └── js/
        ├── app.js      # shared state, data, header/footer, cards
        ├── avatar.js   # avatar editor logic
        └── game.js     # Three.js obby game
```
