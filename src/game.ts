import type { Game, InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  type Assets,
  copy,
  initial,
  effect,
  buildings,
  tile,
  snapshot,
} from "./model";
import { debug, type DeepcoreDebugApi } from "./debug";
import { hasSave, simulate, checkDeath, useItem, jettison } from "./rules";
import { render } from "./render";
import {
  menuItems,
  menuRect,
  controls,
  contains,
  choose,
  back,
  act,
  activateBuilding,
  buildingAt,
} from "./interface";
export type { DeepcoreState } from "./model";
export type { DeepcoreDebugApi } from "./debug";
export const BACKGROUND = "#0b1822";

const urls = import.meta.glob<string>(
  "../assets/{miner,tiles,hazards,ore,materials,surface,rocket,icons,fx,audio}/**/*.{png,json,wav}",
  { eager: true, query: "?url&no-inline", import: "default" },
);
export async function loadAssets(api: InitApi<DeepcoreState>): Promise<Assets> {
  const assets: Assets = { images: {}, systems: {} };
  await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      const name = key.replace("../assets/", "");
      // Both Vite's dev URL and its relative production URL resolve under the
      // engine's fixed assets root. Never fetch or decode beside the engine.
      const path = url.replace(/^\.?\/?assets\//, "");
      if (name.endsWith(".png"))
        assets.images[name] = await api.assets.loadImage(path);
      else if (name.endsWith(".json"))
        assets.systems[name.split("/").pop()!.replace(".json", "")] =
          JSON.parse(
            await (await api.assets.load(path)).text(),
          ) as ParticleSystem;
      else
        await api.audio.load(name.split("/").pop()!.replace(".wav", ""), path);
    }),
  );
  return assets;
}
function targetAt(s: ReadState, x: number, y: number): string | null {
  if (s.screen !== "in-mine")
    for (let i = 0; i < menuItems(s).length; i++) {
      const r = menuRect(s, i);
      if (r && contains(r, x, y)) return `menu:${i}`;
    }
  else {
    for (const c of controls(s))
      if (c.enabled && contains(c.rect, x, y))
        return `control:${c.id}:${c.subject ?? ""}`;
    if (!s.panel)
      for (const b of buildings)
        if (
          contains(
            {
              x: b.x - s.camera.x,
              y: b.y - s.camera.y + C.HUD_H,
              w: b.w,
              h: b.h,
            },
            x,
            y,
          )
        )
          return `building:${b.id}`;
  }
  return null;
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): DeepcoreState {
  let s = copy(state);
  s.simTime += dt;
  const visualDt = s.screen === "paused" ? 0 : dt;
  s.effects = s.effects
    .map((e) => ({ ...e, age: e.age + visualDt }))
    .filter((e) => {
      const emitters = s.assets.systems[e.name]?.emitters;
      const lifetime = emitters
        ? Math.max(
            ...emitters.map(
              (em) =>
                (em.lifetimeMs +
                  (em.lifetimeSpread ?? 0) +
                  (em.emission.mode === "burst" ? em.emission.atMs : 0)) /
                1000,
            ),
          )
        : 2.3;
      return e.age < lifetime;
    });
  s.shake = Math.max(0, s.shake - visualDt * 18);
  s.noteTime = Math.max(0, s.noteTime - visualDt);
  if (s.launchTime !== null) {
    s.launchTime += dt;
    if (
      s.launchTime < 2.5 &&
      Math.floor(s.launchTime * 12) !== Math.floor((s.launchTime - dt) * 12)
    )
      effect(
        s,
        "launch-exhaust",
        buildings[5].x + 154,
        C.SURFACE_Y - s.launchTime ** 2 * 90,
      );
  }
  checkDeath(s);
  if (s.screen === "game-over") s.animationTime += dt;
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  let confirm = api.input.pressed("activate");
  const up = api.input.pressed("up"),
    down = api.input.pressed("down");
  if (api.input.pressed("pause")) s = back(s);
  for (const sample of api.input.pointerSamples()) {
    const target = targetAt(s, sample.x, sample.y);
    if (target?.startsWith("menu:")) s.menuIndex = Number(target.split(":")[1]);
    if (target?.startsWith("control:")) {
      const panelControls = controls(s).filter(
        (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
      );
      const index = panelControls.findIndex(
        (c) => `control:${c.id}:${c.subject ?? ""}` === target,
      );
      if (index >= 0) s.panelIndex = index;
    }
    if (sample.type === "down") {
      if (target) s.pointerDown[sample.id] = target;
      else delete s.pointerDown[sample.id];
      if (target === "control:dismiss-notice:") s.notice = null;
    }
    if (sample.type === "up") {
      if (target && s.pointerDown[sample.id] === target) {
        const [kind, id, subject] = target.split(":");
        if (kind === "menu") confirm = true;
        else if (kind === "control") {
          s = act(s, id, subject || null);
          if (id === "mute") api.audio.setMuted(s.muted);
        } else if (kind === "building") activateBuilding(s, id as C.BuildingId);
      }
      delete s.pointerDown[sample.id];
    }
  }
  if (s.screen !== "in-mine") {
    const count = menuItems(s).length;
    if (count && (up || down))
      s.menuIndex = (s.menuIndex + (down ? 1 : -1) + count) % count;
    if (confirm) s = choose(s);
  } else {
    if (api.input.pressed("inventory")) s = act(s, "inventory", null);
    if (api.input.pressed("jettison")) jettison(s);
    C.ITEM_IDS.forEach((id, i) => {
      if (api.input.pressed(`supply${i + 1}`)) useItem(s, id);
    });
    if (s.panel) {
      const list = controls(s).filter(
        (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
      );
      if (list.length) {
        if (up || down)
          s.panelIndex =
            (s.panelIndex + (down ? 1 : -1) + list.length) % list.length;
        if (confirm) {
          const c = list[s.panelIndex];
          if (c?.enabled) s = act(s, c.id, c.subject);
        }
      }
    } else if (confirm) {
      const b = buildingAt(s);
      if (b) activateBuilding(s, b.id);
    }
    const h = {
      left: api.input.value("left"),
      right: api.input.value("right"),
      down: api.input.value("down"),
      up: api.input.value("up"),
    };
    // A fixed render-free integrator makes cadence, burn, and timers independent
    // of display rate. The remainder is part of the authoritative state.
    s.accumulator += dt;
    const step = 1 / 120;
    while (s.accumulator + 1e-10 >= step) {
      s.accumulator -= step;
      simulate(s, h, step);
    }
    checkDeath(s);
    const first = Math.max(1, Math.floor(s.camera.y / C.TILE)),
      last = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
    if (!s.panel)
      for (let r = first; r <= last; r++)
        for (
          let c = Math.max(1, Math.floor(s.camera.x / C.TILE));
          c <
          Math.min(
            C.WORLD_COLS - 1,
            Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
          );
          c++
        )
          if (tile(s, c, r).kind === "gas") {
            const offset = ((c * 13 + r * 7) % 20) / 10;
            if (
              Math.floor((s.simTime + offset) / C.GAS_SEEP_PERIOD) !==
              Math.floor((s.simTime - dt + offset) / C.GAS_SEEP_PERIOD)
            )
              effect(s, "gas-seep", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
          }
  }
  api.audio.loop(C.CUES.music);
  const live = s.screen === "in-mine" && !s.panel;
  for (const [cue, active] of [
    [C.CUES.drill, live && !!s.miner.drilling],
    [C.CUES.thrust, live && s.miner.state === "jetpack"],
    [
      C.CUES.alarmFuel,
      s.screen === "in-mine" &&
        s.miner.fuel < C.LOW_FUEL_FRACTION * C.FUEL_TIERS[s.tiers.fuel - 1],
    ],
  ] as const) {
    if (active) api.audio.loop(cue);
    else api.audio.stop(cue);
  }
  if (s.screen === "in-mine" && s.coreTimer !== null) {
    const period = s.coreTimer < 15 ? 0.25 : s.coreTimer < 40 ? 0.5 : 1;
    if (
      Math.floor(s.simTime / period) !== Math.floor((s.simTime - dt) / period)
    )
      api.audio.play(C.CUES.alarmCore);
  }
  for (const cue of s.cues) api.audio.play(cue);
  s.cues = [];
  s.muted = api.audio.muted();
  return s;
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const [name, keys] of Object.entries(C.ACTIONS))
      api.input.register(name, { keys: [...keys] });
    const assets = await loadAssets(api);
    const s = initial(assets, false, hasSave());
    const readings = [
      "screen",
      "panel",
      "mode",
      "worldSize",
      "miner",
      "cargo",
      "satchel",
      "tiers",
      "credits",
      "depthMeters",
      "coreTimer",
      "scanner",
    ] as const;
    for (const key of readings)
      api.diagnostics.register(key, (state) => {
        const value = snapshot(state)[key];
        if (key === "miner") {
          const m = snapshot(state).miner;
          return `${m.x.toFixed(0)},${m.y.toFixed(0)} v${m.vx.toFixed(0)},${m.vy.toFixed(0)} ${m.state} ${m.facing} ground:${m.grounded} F:${m.fuel.toFixed(1)}/${m.maxFuel} H:${m.hull.toFixed(1)}/${m.maxHull}`;
        }
        return typeof value === "object"
          ? JSON.stringify(value)
          : (value ?? "-");
      });
    api.diagnostics.register("drilling", (state) =>
      JSON.stringify(snapshot(state).miner.drilling),
    );
    return [s, debug];
  },
  update,
  render,
};
