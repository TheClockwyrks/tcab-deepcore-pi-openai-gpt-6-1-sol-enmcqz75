/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { readFile } from "node:fs/promises";
import { game, BACKGROUND } from "./game";
import * as C from "./constants";
import {
  copy,
  initial,
  emptyMine,
  cell,
  put,
  generate,
  snapshot,
  type Assets,
  type DeepcoreState,
  type ReadState,
} from "./model";
import { debug } from "./debug";
import * as R from "./rules";
import { menuItems, choose, back, controls } from "./interface";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};
let assets: Assets;
const engines: ReturnType<typeof makeEngine>[] = [];
function makeEngine() {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H),
    events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / 120),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  return { engine, events, canvas };
}
function key(events: EventTarget, code: string, down = true) {
  events.dispatchEvent(
    Object.assign(new Event(down ? "keydown" : "keyup"), {
      code,
      repeat: false,
    }),
  );
}
function pointer(
  events: EventTarget,
  type: string,
  x: number,
  y: number,
  id = 1,
  device = "mouse",
) {
  events.dispatchEvent(
    Object.assign(new Event(type), {
      clientX: x,
      clientY: y,
      pointerId: id,
      pointerType: device,
      isPrimary: true,
      buttons: type === "pointerup" ? 0 : 1,
      button: 0,
    }),
  );
}
async function harness() {
  const h = makeEngine();
  await h.engine.initialize();
  engines.push(h);
  return h;
}
function mine(): DeepcoreState {
  const s = initial(assets);
  s.screen = "in-mine";
  return s;
}
const held = { left: 0, right: 0, down: 0, up: 0 };
function step(s: DeepcoreState, seconds: number, h = held): DeepcoreState {
  const n = copy(s);
  for (let t = 0; t < seconds - 1e-8; t += 1 / 120) R.simulate(n, h, 1 / 120);
  return n;
}

beforeAll(async () => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("ImageBitmap", Image);
  vi.stubGlobal("fetch", async (url: string) => {
    const path = decodeURIComponent(url.split("?")[0]);
    try {
      return new Response(await readFile(path.replace(/^\//, "")));
    } catch {
      return new Response("", { status: 404 });
    }
  });
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  // Node has no audio device. The engine still loads the real WAV bytes and emits
  // every cue event; only the platform decoder is replaced by a silent host stub.
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      currentTime = 0;
      decodeAudioData(data: ArrayBuffer) {
        expect(data.byteLength).toBeGreaterThan(100);
        return Promise.resolve({ duration: 1 });
      }
      resume() {
        return Promise.resolve();
      }
    },
  );
  const h = await harness();
  assets = h.engine.state.assets as Assets;
});
afterAll(() => {
  for (const h of engines) h.engine.destroy();
  vi.unstubAllGlobals();
});

describe("engine integration and navigation", () => {
  it("loads every real asset and supplies the inert debug surface", async () => {
    const h = await harness();
    expect(h.engine.debug.version).toBe(C.DEEPCORE_DEBUG_VERSION);
    expect(Object.keys(assets.images).length).toBeGreaterThan(90);
    expect(Object.keys(assets.systems)).toHaveLength(12);
    const s = debug.snapshot(h.engine.state);
    expect(s.screen).toBe("title");
    expect(s.summary).toBeNull();
    expect(h.engine.diagnostics().every((d) => !d.error)).toBe(true);
  });
  it("uses dispatched engine actions to begin, drill, thrust, pause and resume", async () => {
    const { engine, events } = await harness();
    for (let i = 0; i < 3; i++) {
      key(events, "Enter");
      await engine.advance(1);
      key(events, "Enter", false);
      await engine.advance(1);
    }
    expect(engine.state.screen).toBe("in-mine");
    expect(engine.state.worldSize).toBe("quick");
    const startY = engine.state.miner.y;
    key(events, "KeyS");
    await engine.advance(62);
    key(events, "KeyS", false);
    expect(engine.state.miner.y).toBeGreaterThan(startY + C.TILE - 2);
    expect(engine.state.miner.fuel).toBeLessThan(C.FUEL_TIERS[0]);
    key(events, "Space");
    await engine.advance(70);
    key(events, "Space", false);
    expect(engine.state.miner.y).toBeLessThan(startY);
    expect(engine.state.miner.state).toBe("jetpack");
    key(events, "Escape");
    await engine.advance(1);
    key(events, "Escape", false);
    const y = engine.state.miner.y;
    await engine.advance(100);
    expect(engine.state.miner.y).toBe(y);
    key(events, "KeyP");
    await engine.advance(1);
    key(events, "KeyP", false);
    expect(engine.state.screen).toBe("in-mine");
  }, 20000);
  it("pointer selection requires matching press and release regions", async () => {
    const { engine, events } = await harness();
    const a = debug.menuItemRect(engine.state, 0)!;
    const b = debug.menuItemRect(engine.state, 1)!;
    pointer(events, "pointerdown", a.x + 10, a.y + 10);
    pointer(events, "pointerup", b.x + 10, b.y + 10);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    pointer(events, "pointerdown", b.x + 10, b.y + 10, 2, "touch");
    pointer(events, "pointerup", b.x + 10, b.y + 10, 2, "touch");
    await engine.advance(1);
    expect(engine.state.screen).toBe("how-to-play");
    key(events, "Escape");
    await engine.advance(1);
    key(events, "Escape", false);
    expect(engine.state.menuIndex).toBe(1);
  });
  it("renders every panel and screen, and pointer controls use the same transactions", async () => {
    const { engine, events } = await harness();
    engine.apply((s) => debug.setScreen(s, "in-mine"));
    engine.apply((s) => debug.generateMine(s));
    engine.apply((s) => debug.setCredits(s, 100000));
    for (const m of C.MINERALS) engine.apply((s) => debug.setCargo(s, m.id, 1));
    for (const item of C.ITEM_IDS)
      engine.apply((s) => debug.setItemCount(s, item, 2));
    for (const panel of C.PANELS) {
      engine.apply((s) => debug.setPanel(s, panel));
      await engine.advance(1);
      expect(engine.state.panel).toBe(panel);
    }
    engine.apply((s) => debug.setPanel(s, "fuel-depot"));
    engine.apply((s) => debug.setFuel(s, 50));
    const fuel = debug.controlRect(engine.state, "buy-fuel", null)!;
    pointer(events, "pointerdown", fuel.x + 10, fuel.y + 10);
    pointer(events, "pointerup", fuel.x + 10, fuel.y + 10);
    await engine.advance(1);
    expect(engine.state.miner.fuel).toBe(75);
    const mute = debug.controlRect(engine.state, "mute", null)!;
    pointer(events, "pointerdown", mute.x + 10, mute.y + 10);
    pointer(events, "pointerup", mute.x + 10, mute.y + 10);
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    engine.apply((s) => debug.setPanel(s, "inventory"));
    engine.apply((s) => debug.setCoreCarried(s, true));
    await engine.advance(1);
    const drop = debug.controlRect(engine.state, "drop-ore", "ferron")!;
    pointer(events, "pointerdown", drop.x + 10, drop.y + 10);
    pointer(events, "pointerup", drop.x + 10, drop.y + 10);
    await engine.advance(1);
    expect(engine.state.cargo.ferron).toBe(0);
    engine.apply((s) => debug.setHull(s, 0));
    await engine.advance(1);
    expect(engine.state.screen).toBe("game-over");
    for (const screen of C.SCREENS.filter((s) => s !== "in-mine")) {
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
  }, 15000);
  it("records sprite drawing without changing simulation rules", async () => {
    const { engine } = await harness();
    engine.apply((s) => debug.setScreen(s, "in-mine"));
    engine.startRecording();
    await engine.advance(2);
    const recording = engine.stopRecording();
    expect(recording.frames).toHaveLength(2);
    expect(recording.ops.length).toBeGreaterThan(100);
    expect(recording.images.length).toBeGreaterThan(0);
  });
  it("reaches identical states at fixed, uneven and coarse display rates", async () => {
    const a = await harness(),
      b = await harness();
    for (const h of [a, b]) {
      h.engine.apply((s) => debug.setScreen(s, "in-mine"));
      h.engine.apply((s) => debug.setFuel(s, 1000));
      h.engine.apply((s) => debug.setMinerPosition(s, 600, 500));
    }
    a.engine.setClock(new ConstantClock(1000 / 60));
    b.engine.setClock(new SequenceClock([10, 30, 20, 40]));
    await a.engine.advance(60);
    await b.engine.advance(40);
    expect(a.engine.state.miner.y).toBeCloseTo(b.engine.state.miner.y, 6);
    expect(a.engine.state.miner.fuel).toBeCloseTo(b.engine.state.miner.fuel, 6);
    expect(a.engine.state.elapsedSeconds).toBeCloseTo(1, 6);
  });
});

describe("immutable debug poses and derived readings", () => {
  it("poses only one field, rejects invalid domains, and never mutates the input", () => {
    const old = mine();
    const fuel = debug.setFuel(old, 500);
    expect(old.miner.fuel).toBe(100);
    expect(fuel.miner.fuel).toBe(500);
    expect(fuel.grid).toBe(old.grid);
    expect(debug.reconcile(fuel)).toEqual(fuel);
    expect(() => debug.setFuel(old, -1)).toThrow();
    expect(() => debug.setTier(old, "fuel", 6)).toThrow();
    expect(() => debug.setTile(old, -1, 1, "rock")).toThrow();
    expect(() => debug.setCoreTimer(old, 20)).toThrow();
    expect(() => debug.setMenuIndex(old, 0)).toThrow();
    expect(() => debug.setTileHealth(old, 4, 3, 1)).toThrow();
  });
  it("derives load, depth, maxima and rocket requirements directly", () => {
    let s = mine();
    s = debug.setCargo(s, "aurite", 4);
    s = debug.setMinerPosition(s, 800, 1600 - C.MINER_H);
    s = debug.setTier(s, "hull", 4);
    s = debug.setRocketInstalled(s, 3);
    const snap = debug.snapshot(s);
    expect(snap.cargo.loadKg).toBe(464);
    expect(snap.miner.overloaded).toBe(true);
    expect(snap.depthMeters).toBe(95);
    expect(snap.miner.maxHull).toBe(320);
    expect(snap.rocket.nextComponent).toBe("thruster");
    expect(snap.deepestDepthMeters).toBe(0);
    expect(snap.scanner.locked).toBe(false);
  });
  it("resizes arrays preserving bands, health, material and core chamber invariants", () => {
    let s = mine();
    s = debug.setOreTile(s, 4, 70, "cuprite");
    s = debug.setTileHealth(s, 4, 70, 2);
    s = debug.setMaterialTile(s, 5, 140, "resonite");
    const t = debug.tileAt(s, 4, 70);
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 4, 70)).toEqual(t);
    expect(debug.tileAt(s, 5, 140).material).toBe("resonite");
    expect(debug.tileAt(s, C.CORE_COL, 250).kind).toBe("core");
    expect(debug.tileAt(s, 5, 500).band).toBeNull();
    s = debug.setWorldSize(s, "marathon");
    expect(debug.tileAt(s, C.CORE_COL, 250).kind).toBe("tunnel");
    expect(debug.tileAt(s, C.CORE_COL, 1000).kind).toBe("core");
  });
  it("finds the nearest tile and locks the scanner only to needed in-range nodes", () => {
    let s = mine();
    s = debug.setMaterialTile(s, 4, 8, "resonite");
    s = debug.setMaterialTile(s, 4, 15, "cryenite");
    s = debug.setTier(s, "scanner", 2);
    expect(debug.findTile(s, "material")).toEqual({ col: 4, row: 8 });
    expect(snapshot(s).scanner.target).toBe("resonite");
    s = debug.setMaterial(s, "resonite", 1);
    expect(snapshot(s).scanner.locked).toBe(false);
    s = debug.setTier(s, "scanner", 3);
    expect(snapshot(s).scanner.target).toBe("cryenite");
    s = debug.setMaterial(s, "cryenite", 1);
    expect(snapshot(s).scanner.locked).toBe(false);
  });
  it("reset restores every expedition value but keeps mute and save preference", () => {
    let s = mine();
    s.muted = true;
    s.hasSave = true;
    s = debug.setItemCount(s, "nanobots", 9);
    s = debug.setCredits(s, 800);
    s = debug.setCoreCarried(s, true);
    s = debug.setNoticeFired(s, "lava", true);
    s = debug.setCameraLead(s, 80);
    s = debug.reset(s);
    expect(s).toEqual(initial(assets, true, true));
  });
});

describe("world generation", () => {
  for (const size of C.WORLD_SIZES)
    it(`generates ${size}: bands, density, materials, lava pools and a safe spine`, () => {
      let s = mine();
      s = debug.setWorldSize(s, size);
      generate(s);
      expect(s.grid).toHaveLength(s.coreRow + 1);
      expect(s.grid[1][C.CAVE_MOUTH_COL].kind).toBe("tunnel");
      for (const b of C.BANDS) {
        const cells = s.grid
          .flat()
          .filter((t) => t.band === b && t.kind !== "bedrock");
        const ore = cells.filter((t) => t.kind === "ore").length / cells.length;
        expect(ore).toBeGreaterThan(C.ORE_DENSITY * (1 - C.DENSITY_TOLERANCE));
        expect(ore).toBeLessThan(C.ORE_DENSITY * (1 + C.DENSITY_TOLERANCE));
        if (b === "topsoil")
          expect(
            cells.some((t) => ["gas", "lava", "stone"].includes(t.kind)),
          ).toBe(false);
      }
      for (const m of C.MATERIALS)
        expect(s.grid.flat().filter((t) => t.material === m)).toHaveLength(1);
      for (let r = 1; r < s.coreRow; r++)
        expect(
          ["lava", "stone"].includes(s.grid[r][C.CAVE_MOUTH_COL].kind),
        ).toBe(false);
      expect(
        s.grid
          .slice(1, 4)
          .flat()
          .some((t) => t.kind === "ore"),
      ).toBe(false);
    });
});

describe("movement, drilling and fuel", () => {
  it("cuts with exact hit cadence, persists damage, and banks an ore only at break", () => {
    let s = mine();
    s = debug.setMinerTravel(s, false);
    s = debug.setOreTile(s, 4, 1, "ferron");
    const down = { ...held, down: 1 };
    s = step(s, 0.25, down);
    expect(s.grid[1][4].health).toBe(2);
    expect(s.cargo.ferron).toBeUndefined();
    expect(s.miner.fuel).toBeCloseTo(99.5);
    s = step(s, 0.1);
    expect(s.grid[1][4].health).toBe(2);
    s = step(s, 0.25, down);
    expect(s.grid[1][4].kind).toBe("tunnel");
    expect(s.cargo.ferron).toBe(1);
    expect(s.miner.y).toBe(C.SURFACE_Y - C.MINER_H);
  });
  it("cannot start cuts while airborne or cut up, stone, and bedrock", () => {
    let s = mine();
    s = debug.setTile(s, 4, 2, "rock");
    s = debug.setMinerDrill(s, false);
    const n = step(s, 0.5, { ...held, down: 1 });
    expect(n.grid[2][4].health).toBe(C.BAND_HEALTH.topsoil);
    s = debug.setTile(s, 4, 1, "stone");
    s = step(s, 0.5, { ...held, down: 1 });
    expect(s.miner.drilling).toBeNull();
    expect(s.miner.fuel).toBe(100);
  });
  it("slot overflow still clears a tile, and explosives destroy ore but preserve nodes", () => {
    let s = mine();
    s = debug.setCargo(s, "ferron", C.CARGO_TIERS[0]);
    s = debug.setOreTile(s, 4, 1, "cuprite");
    R.breakCell(s, 4, 1);
    expect(s.cargo.cuprite).toBeUndefined();
    expect(s.note).toMatch(/Cargo full/);
    s = debug.setItemCount(s, "dynamite", 1);
    s = debug.setMaterialTile(s, 4, 1, "resonite");
    s = debug.setOreTile(s, 5, 1, "cuprite");
    R.useItem(s, "dynamite");
    expect(s.grid[1][4].kind).toBe("material");
    expect(s.grid[1][5].kind).toBe("tunnel");
    expect(s.items.dynamite).toBe(0);
  });
  it("weight slows lift, and overload prevents takeoff until ore is dropped", () => {
    const empty = step(mine(), 0.5, { ...held, up: 1 });
    let loaded = debug.setCargo(mine(), "aurite", 3);
    loaded = step(loaded, 0.5, { ...held, up: 1 });
    expect(empty.miner.y).toBeLessThan(loaded.miner.y);
    let over = debug.setCargo(mine(), "aurite", 4);
    put(over, 4, 1, cell("rock", "topsoil"));
    over = step(over, 0.5, { ...held, up: 1 });
    expect(over.miner.y).toBe(8);
    over = debug.dropOre(over, "aurite");
    over = step(over, 0.5, { ...held, up: 1 });
    expect(over.miner.y).toBeLessThan(8);
  });
  it("life support drains below the surface; surface idling never refills", () => {
    let s = debug.setMinerTravel(mine(), false);
    s = debug.setMinerPosition(s, 400, 400);
    s = step(s, 5);
    expect(s.miner.fuel).toBeCloseTo(98);
    s = debug.setMinerPosition(s, 400, 8);
    s = step(s, 5);
    expect(s.miner.fuel).toBeCloseTo(98);
  });
  it("hard landings cost hull, camera leads over time and sky has no ceiling", () => {
    let s = mine();
    put(s, 4, 12, cell("rock", "topsoil"));
    s = step(s, 2);
    expect(s.miner.hull).toBeLessThan(100);
    expect(s.cues).toContain(C.CUES.impact);
    s = debug.setFuel(mine(), 1000);
    s = step(s, 5, { ...held, up: 1 });
    expect(s.miner.y).toBeLessThan(-1000);
    expect(s.camera.y).toBeLessThan(-1000);
    expect(s.camera.lead).toBe(-C.CAM_LEAD_MAX);
  });
});

describe("hazards and Core clock", () => {
  it("gas applies unreduced damage, knockback, produced effect and delayed notice", () => {
    let s = mine();
    s = debug.setMinerPosition(s, 4 * C.TILE + 12, 126 * C.TILE - C.MINER_H);
    s = debug.setTier(s, "hull", 5);
    s = debug.setHull(s, 450);
    s = debug.setMinerTravel(s, false);
    s = debug.setTile(s, 4, 126, "gas");
    R.breakCell(s, 4, 126);
    expect(s.miner.hull).toBeCloseTo(
      450 -
        C.GAS_DAMAGE_MIN -
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, 125 / 499 - 0.25)) /
          0.75,
    );
    expect(s.notice?.shown).toBe(false);
    s = step(s, C.NOTICE_DELAY);
    expect(s.notice?.shown).toBe(true);
    expect(s.noticesFired.gas).toBe(true);
    expect(s.effects.some((e) => e.name === "gas-explosion")).toBe(true);
  });
  it("radiator mitigates lava drilling damage only, and contact drains over time", () => {
    let s = mine();
    s = debug.setTile(s, 4, 300, "lava");
    s = debug.setTier(s, "radiator", 5);
    R.breakCell(s, 4, 300);
    expect(s.miner.hull).toBeCloseTo(100 - C.LAVA_DRILL_DEEPSTONE * 0.2);
    s = debug.setMinerTravel(s, false);
    s = debug.setMinerPosition(s, 4 * C.TILE + 12, 300 * C.TILE);
    s = debug.setTile(s, 4, 300, "lava");
    s = step(s, 1);
    expect(s.miner.hull).toBeCloseTo(88 - C.LAVA_CONTACT_DPS * 0.2);
  });
  it("Core countdown continues in panels, freezes on pause, and detonates location-aware", async () => {
    const { engine, events } = await harness();
    engine.apply((s) => debug.setScreen(s, "in-mine"));
    engine.apply((s) => debug.setCoreCarried(s, true));
    engine.apply((s) => debug.setPanel(s, "inventory"));
    await engine.advance(120);
    expect(engine.state.coreTimer).toBeCloseTo(89);
    engine.apply((s) => debug.setScreen(s, "paused"));
    await engine.advance(120);
    expect(engine.state.coreTimer).toBeCloseTo(89);
    engine.apply((s) => debug.setScreen(s, "in-mine"));
    engine.apply((s) => debug.setCoreTimer(s, 0.1));
    await engine.advance(13);
    expect(engine.state.screen).toBe("game-over");
    expect(engine.state.summary?.deathCause).toBe("core-detonation");
    key(events, "KeyS", false);
    let s = debug.placeCoreSample(mine(), 20, 20);
    s = debug.setCoreTimer(s, 0.1);
    s = step(s, 0.2);
    expect(s.screen).toBe("in-mine");
    expect(s.coreTimer).toBeNull();
  });
  it("hull zero is a death even with inventory open; fuel zero only kills underground", () => {
    let s = debug.setPanel(mine(), "inventory");
    s = debug.setHull(s, 0);
    s = step(s, 1 / 120);
    expect(s.screen).toBe("game-over");
    expect(s.summary?.deathCause).toBe("hull-destroyed");
    let n = debug.setFuel(mine(), 0);
    n = debug.setMinerTravel(n, false);
    n = step(n, 1);
    expect(n.screen).toBe("in-mine");
    n = debug.setMinerPosition(n, 400, 400);
    n = step(n, 1 / 120);
    expect(n.summary?.deathCause).toBe("fuel-out");
  });
  it("Core is inexhaustible; jettison does not reset the clock or allow another sample", () => {
    let s = mine();
    R.extract(s);
    s = debug.setCoreTimer(s, 25);
    R.jettison(s);
    expect(s.coreTimer).toBe(25);
    expect(s.satchel.coreSample).toBe(false);
    expect(s.coreGround).not.toBeNull();
    R.extract(s);
    expect(s.satchel.coreSample).toBe(false);
    expect(() => debug.setCoreCarried(s, true)).toThrow();
  });
});

describe("economy, supplies, fabrication and saves", () => {
  it("selling is exact, incremental refills pay only for missing resources", () => {
    let s = debug.setCargo(mine(), "ferron", 4);
    s = debug.setCargo(s, "aurite", 1);
    R.sell(s);
    expect(s.credits).toBe(4 * 28 + 2460);
    expect(s.creditsEarned).toBe(s.credits);
    expect(s.cargo).toEqual({});
    s = debug.setFuel(s, 90);
    const before = s.credits;
    R.refill(s, false, false);
    expect(s.miner.fuel).toBe(100);
    expect(s.credits).toBe(before - 10);
    s = debug.setCredits(s, 3);
    s = debug.setHull(s, 50);
    R.refill(s, true, true);
    expect(s.miner.hull).toBe(51.5);
    expect(s.credits).toBe(0);
  });
  it("upgrades add max-resource differences but not a free refill, and reject unaffordable steps", () => {
    let s = debug.setFuel(mine(), 30);
    s = debug.setCredits(s, 1000);
    R.buyUpgrade(s, "fuel");
    expect(s.miner.fuel).toBe(105);
    expect(s.credits).toBe(700);
    R.buyUpgrade(s, "fuel");
    expect(s.tiers.fuel).toBe(2);
    s = debug.setCredits(s, 10000);
    R.buyUpgrade(s, "hull");
    expect(s.miner.hull).toBe(150);
  });
  it("supplies consume once, reject no-ops, and posed teleporter draws are independent", () => {
    let s = debug.setCredits(mine(), 10000);
    R.buyItem(s, "nanobots");
    expect(s.credits).toBe(6000);
    R.useItem(s, "nanobots");
    expect(s.items.nanobots).toBe(1);
    s = debug.setHull(s, 70);
    R.useItem(s, "nanobots");
    expect(s.miner.hull).toBe(90);
    expect(s.items.nanobots).toBe(0);
    s = debug.setItemCount(s, "emergency-fuel", 1);
    s = debug.setFuel(s, 80);
    R.useItem(s, "emergency-fuel");
    expect(s.miner.fuel).toBe(100);
    s = debug.setItemCount(s, "quantum-teleporter", 1);
    s = debug.setNextTeleportHeight(s, 8);
    s = debug.setNextTeleportSpeed(s, 700);
    R.useItem(s, "quantum-teleporter");
    expect(s.miner.y).toBe(C.SURFACE_Y - C.MINER_H - 8 * C.TILE);
    expect(s.miner.vy).toBe(700);
    expect(s.nextTeleportHeight).toBeNull();
    expect(s.nextTeleportSpeed).toBeNull();
    s = debug.setItemCount(s, "matter-transmitter", 1);
    R.useItem(s, "matter-transmitter");
    expect(s.miner.y).toBe(8);
    expect(s.miner.vy).toBe(0);
  });
  it("five components consume their materials and timer; only a complete rocket wins", () => {
    let s = debug.setCredits(mine(), C.ROCKET_TOTAL_CREDITS);
    R.launch(s);
    expect(s.screen).toBe("in-mine");
    R.fabricate(s);
    R.fabricate(s);
    R.fabricate(s);
    expect(s.installed).toBe(2);
    s = debug.setMaterial(s, "resonite", 1);
    s = debug.setMaterial(s, "cryenite", 1);
    s = debug.setCoreCarried(s, true);
    R.fabricate(s);
    R.fabricate(s);
    R.fabricate(s);
    expect(s.installed).toBe(5);
    expect(s.coreTimer).toBeNull();
    expect(s.credits).toBe(0);
    R.launch(s);
    expect(s.screen).toBe("victory");
    expect(s.summary?.componentsInstalled).toBe(5);
  });
  it("saves all expedition progress, refuses live samples, restores on surface, and obeys mode loss", () => {
    let s = debug.setCredits(mine(), 700);
    s = debug.setOreTile(s, 8, 20, "ferron");
    s = debug.setItemCount(s, "dynamite", 2);
    R.save(s);
    expect(s.hasSave).toBe(true);
    s = debug.setCoreCarried(s, true);
    R.save(s);
    expect(s.note).toMatch(/Cannot save/);
    R.finish(s, "fuel-out");
    expect(s.hasSave).toBe(true);
    s = R.restore(s);
    expect(s.screen).toBe("in-mine");
    expect(s.credits).toBe(700);
    expect(s.items.dynamite).toBe(2);
    expect(s.grid[20][8].ore).toBe("ferron");
    expect(s.miner.y).toBe(8);
    s = debug.setMode(s, "hardcore");
    R.finish(s, "hull-destroyed");
    expect(s.hasSave).toBe(false);
    expect(R.hasSave()).toBe(false);
  });
  it("all panel controls have usable on-stage regions and menus return to their entry", () => {
    let s = mine();
    s.credits = 100000;
    for (const panel of C.PANELS) {
      s.panel = panel;
      for (const c of controls(s)) {
        expect(c.rect.x).toBeGreaterThanOrEqual(0);
        expect(c.rect.y + c.rect.h).toBeLessThanOrEqual(C.STAGE_H);
        if (c.id !== "close-panel")
          expect(debug.controlRect(s, c.id, c.subject)).toEqual(c.rect);
      }
    }
    s.screen = "mode-select";
    s.menuIndex = 1;
    s = choose(s);
    expect(s.mode).toBe("hardcore");
    expect(s.screen).toBe("size-select");
    s = back(s);
    expect(s.menuIndex).toBe(1);
    s = back(s);
    expect(menuItems(s)[s.menuIndex]).toBe("NEW EXPEDITION");
  });
});

// Type-level guard: an observable state must remain a read-only input to every
// simulation and debug operation, not an alternate mutable engine singleton.
const _readonlyGuard: (s: ReadState) => DeepcoreState = debug.reconcile;
void _readonlyGuard;
void emptyMine;
