# Deepcore

**Depth is cheap. Height is expensive.**

Deepcore is a browser-only subterranean dig-and-build game. A stranded prospector drills for ore, hauls it home with a fuel-hungry jetpack, and finances an escape rocket. The mine has four geological bands, thirteen saleable minerals, buried exotic materials, gas pockets, lava pools, and an inexhaustible — but dangerously unstable — Core.

Choose **Standard** (restore the last Save Pad checkpoint after death) or **Hardcore** (death deletes the save), then a Quick, Standard, or Marathon world. Build all five rocket components and launch to win.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. There is no backend, login, or external service.

## Production

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve that directory as-is, including from a subdirectory. All generated asset URLs are relative to the page. The build only bundles committed assets; it does not run any asset-generation tools.

## Controls

| Input | Action |
| --- | --- |
| A / D, left / right arrows | Walk or drift; drill sideways against a wall while grounded |
| S / down arrow | Drill down while grounded |
| W / up arrow / Space | Jetpack thrust |
| E / Enter | Activate a surface building; confirm a menu or panel choice |
| I | Open / close cargo and supplies |
| Escape / P | Pause / resume, close a panel, or go back |
| M | Toggle audio |
| J | Jettison a live Core Sample |
| 1–6 | Dynamite, plastic explosives, quantum teleporter, matter transmitter, nanobots, emergency fuel |
| Backtick | Engine diagnostic overlay |

Use up/down to navigate menus and panel rows, and Enter to confirm. Menus, terminals, inventory controls, and the status bar also accept mouse, pen, and touch. The miner itself uses the keyboard.

## Surviving a dig

- Drill **down, left, and right — never up**. Keep a tunnel open for the flight home.
- Cargo slots limit quantity; ore weight limits lift. Drop individual units in the inventory if overloaded.
- Fuel pays for thrust, aerial drift, drilling, and underground life support. Neither fuel nor hull regenerates. Sell at the Ore Market, then pay the Fuel Depot for the next trip.
- Buy equipment at the Upgrade Shop and single-use field supplies at the Supply Depot. A scanner locates needed Resonite and Cryenite nodes within range.
- Watch ordinary-looking rock for gas seeps. Radiators help with lava, not gas. Brake with thrust before a long fall ends.
- The Core Sample destabilizes after 90 seconds. Its timer continues inside inventory and building panels; only the pause menu freezes it. Fabricate the Ignition Core, or jettison the Sample and move clear.
- Activate the Save Pad to write the one local save. A live Sample prevents saving. Browser storage is optional; if unavailable, the game remains playable without saves.

## Checks

```sh
npm run typecheck
npm run lint
npx prettier --check .
npx vitest run --coverage
```

The test suite includes an actual Simple 2D engine over a native canvas, dispatched keyboard/pointer input, uneven clocks, immutable poses, generation, movement, economy, hazards, saves, and victory. Coverage reports are written to `coverage/`.

## Project map

- `src/game.ts`: engine registrations, asset loading, action routing, fixed-step integration.
- `src/model.ts`: authoritative state, immutable structural sharing, generation, derived readings.
- `src/rules.ts`: movement, drilling, hazards, supplies, transactions, and persistence.
- `src/debug.ts`: the versioned, render-free automation surface returned by `engine.debug`.
- `src/interface.ts` and `src/render.ts`: shared hit regions, screen navigation, and canvas presentation.
- `assets/`: original PNG animation frames, sprites, live particle systems, WAV cues, and the score's MIDI source.
- `assets/source/`: the asset tools' operation logs, configurations, and production previews.
- `tools/art.py` and `tools/sound_fx.py`: one-time asset-authoring scripts. They require the production tools, **not** the game build.
- `tools/capture.mjs`: one-time Playwright showcase capture, using the shipped engine, debug poses, and normal input actions against Vite.
- `showcase/`: player-facing description, screenshots, and an engine-recorded live-play replay.

The Simple 2D engine owns the frame loop, input, audio, loading, fitting, recording, and diagnostics. The simulation returns a new state value every frame, integrates at 120 Hz, and never reads the renderer. Terrain rows are shared until replaced by a cut or pose. All animation and effects are drawn from authored assets; effect ages live in the simulation so re-rendering a state is deterministic.
