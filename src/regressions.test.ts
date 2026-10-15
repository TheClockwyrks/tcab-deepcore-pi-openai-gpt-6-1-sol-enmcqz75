/// <reference types="node" />
import { describe, expect, it, vi } from "vitest";
import * as C from "./constants";
import { debug } from "./debug";
import { initial, type Assets, tile, grounded } from "./model";
import { controls, menuItems, menuRect, choose, back, act } from "./interface";
import * as R from "./rules";

const emptyAssets: Assets = { images: {}, systems: {} };
const state = () => initial(emptyAssets);

describe("pose and transaction edge cases", () => {
  it("eases a downward bite, withdraws safely, and never sinks through the Core", () => {
    const held = { left: 0, right: 0, up: 0, down: 1 };
    let s = debug.setScreen(state(), "in-mine");
    s = debug.setTile(s, 4, 1, "rock");
    s = debug.setTile(s, 4, 2, "rock");
    for (let i = 0; i < 7; i++) R.simulate(s, held, 1 / 120);
    expect(s.miner.y).toBeGreaterThan(C.SURFACE_Y - C.MINER_H);
    expect(s.grid[1][4].health).toBe(C.BAND_HEALTH.topsoil);
    expect(grounded(s)).toBe(true);
    for (let i = 0; i < 30; i++)
      R.simulate(s, { ...held, down: 0, up: 1 }, 1 / 120);
    expect(s.miner.y).toBeLessThan(C.SURFACE_Y - C.MINER_H);
    s = debug.setMinerPosition(
      s,
      C.CORE_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      s.coreRow * C.TILE - C.MINER_H,
    );
    s = debug.setMinerVelocity(s, 0, 0);
    const y = s.miner.y;
    for (let i = 0; i < 15; i++) R.simulate(s, held, 1 / 120);
    expect(s.satchel.coreSample).toBe(true);
    expect(s.coreTimer).toBe(C.CORE_TIMER);
    expect(s.miner.y).toBe(y);
    expect(s.grid[s.coreRow][C.CORE_COL].kind).toBe("core");
    for (let i = 0; i < 30; i++)
      R.simulate(s, { ...held, down: 0, up: 1 }, 1 / 120);
    expect(s.miner.y).toBeLessThan(y);
  });
  it("clearMine preserves cell bands, borders, chamber and ground items", () => {
    let s = debug.setScreen(state(), "in-mine");
    s = debug.setOreTile(s, 4, 100, "ferron");
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 4, 100).band).toBe("topsoil");
    s = debug.setTile(s, 0, 3, "stone");
    s = debug.placeCoreSample(s, 5, 30);
    const n = debug.clearMine(s);
    expect(debug.tileAt(n, 4, 100)).toMatchObject({
      kind: "tunnel",
      band: "topsoil",
    });
    expect(debug.tileAt(n, 0, 3).kind).toBe("stone");
    expect(debug.tileAt(n, C.CORE_COL, s.coreRow).kind).toBe("core");
    expect(n.coreGround).toEqual({ col: 5, row: 30 });
    expect(s.grid[100][4].ore).toBe("ferron");
  });
  it("outside-grid readings are bedrock while the physical sky remains unbounded", () => {
    const s = state();
    for (const [c, r] of [
      [3, -1],
      [32, 1],
      [-1, 1],
      [3, 1001],
      [1.5, 2],
    ])
      expect(debug.tileAt(s, c, r)).toEqual({
        kind: "bedrock",
        band: null,
        ore: null,
        material: null,
        health: null,
        maxHealth: null,
      });
    expect(tile(s, 3, -1).kind).toBe("tunnel");
    expect(menuRect(s, 0.5)).toBeNull();
    expect(() => debug.controlRect(s, "not-a-control", null)).toThrow();
    expect(() => debug.controlRect(s, "drop-ore", "unknown-ore")).toThrow();
    expect(debug.controlRect(s, "buy-upgrade", "scanner")).toBeNull();
    expect(debug.controlRect(s, "use-item", "nanobots")).toBeNull();
  });
  it("fixed increments require affordability; full refills spend only available Credits", () => {
    let s = debug.setFuel(state(), 50);
    s = debug.setCredits(s, 10);
    s = debug.buyFuel(s);
    expect(s.miner.fuel).toBe(50);
    s = debug.fillFuel(s);
    expect(s.miner.fuel).toBe(60);
    expect(s.credits).toBe(0);
    s = debug.setHull(s, 80);
    s = debug.setCredits(s, 1);
    s = debug.buyRepair(s);
    expect(s.miner.hull).toBe(80);
    s = debug.repairFull(s);
    expect(s.miner.hull).toBe(80.5);
    expect(s.credits).toBe(0);
  });
  it("a transmitter already at its destination and an empty blast consume nothing", () => {
    let s = debug.setItemCount(state(), "matter-transmitter", 1);
    s = debug.setScreen(s, "in-mine");
    s = debug.useItem(s, "matter-transmitter");
    expect(s.items["matter-transmitter"]).toBe(1);
    s = debug.setItemCount(s, "plastic-explosives", 1);
    s = debug.useItem(s, "plastic-explosives");
    expect(s.items["plastic-explosives"]).toBe(1);
    s = debug.setTile(s, 4, 1, "stone");
    s = debug.useItem(s, "plastic-explosives");
    expect(s.items["plastic-explosives"]).toBe(0);
  });
  it("compact saves retain mixed bands and partial damage at Marathon depth", () => {
    let saved = "";
    vi.stubGlobal("localStorage", {
      getItem: () => saved || null,
      setItem: (_: string, value: string) => {
        saved = value;
      },
      removeItem: () => {
        saved = "";
      },
    });
    try {
      let s = debug.setWorldSize(state(), "quick");
      s = debug.setOreTile(s, 4, 100, "argenite");
      s = debug.setTileHealth(s, 4, 100, 2.5);
      s = debug.setWorldSize(s, "marathon");
      const original = debug.tileAt(s, 4, 100);
      s = debug.save(s);
      expect(saved.length).toBeLessThan(1000000);
      const n = R.restore(s);
      expect(n.coreRow).toBe(1000);
      expect(debug.tileAt(n, 4, 100)).toEqual(original);
      expect(n.miner.x).toBe(C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2);
      s = debug.clearSave(s);
      expect(s.hasSave).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("gracefully refuses persistence when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw Error("denied");
      },
      setItem: () => {
        throw Error("quota");
      },
      removeItem: () => {
        throw Error("denied");
      },
    });
    try {
      expect(R.hasSave()).toBe(false);
      const s = debug.save(state());
      expect(s.hasSave).toBe(false);
      expect(s.note).toContain("unavailable");
      expect(debug.clearSave(s).hasSave).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("exposes every transaction through independent immutable debug controls", () => {
    const original = state();
    let s = debug.setCredits(original, 100000);
    s = debug.buyUpgrade(s, "scanner");
    s = debug.buyItem(s, "dynamite");
    s = debug.setCargo(s, "roselite", 2);
    s = debug.sell(s);
    s = debug.setMaterial(s, "resonite", 1);
    s = debug.fabricate(s);
    s = debug.setRocketInstalled(s, 5);
    s = debug.launch(s);
    expect(s.screen).toBe("victory");
    expect(original.credits).toBe(0);
    expect(original.tiers.scanner).toBe(1);
    expect(original.items.dynamite).toBe(0);
    s = debug.setFacing(s, "west");
    s = debug.setNoticeFired(s, "lava", true);
    s = debug.dismissNotice(s);
    s = debug.clearCargo(s);
    s = debug.clearItems(s);
    expect(s.miner.facing).toBe("west");
    expect(s.items.dynamite).toBe(0);
    expect(s.notice).toBeNull();
  });
});

describe("UI routes share the transaction rules", () => {
  it("all seven tracks and six supplies have enabled buy controls and prices", () => {
    let s = debug.setScreen(state(), "in-mine");
    s = debug.setCredits(s, 100000);
    s = debug.setPanel(s, "upgrade-shop");
    expect(
      controls(s).filter((c) => c.id === "buy-upgrade" && c.enabled),
    ).toHaveLength(C.TRACKS.length);
    for (const track of C.TRACKS) s = act(s, "buy-upgrade", track);
    expect(Object.values(s.tiers).every((t) => t === 2)).toBe(true);
    s = debug.setPanel(s, "supply-depot");
    for (const item of C.ITEM_IDS) s = act(s, "buy-item", item);
    expect(Object.values(s.items).every((n) => n === 1)).toBe(true);
    s = act(s, "close-panel", null);
    expect(s.panel).toBeNull();
  });
  it("every back route and summary menu selects the entry it came from", () => {
    let s = state();
    s.menuIndex = 1;
    s = choose(s);
    expect(s.screen).toBe("how-to-play");
    s = back(s);
    expect(menuItems(s)[s.menuIndex]).toBe("HOW TO PLAY");
    s.menuIndex = 0;
    s = choose(s);
    expect(s.screen).toBe("mode-select");
    s.menuIndex = 2;
    s = choose(s);
    expect(s.screen).toBe("title");
    s.screen = "paused";
    s.menuIndex = 2;
    s = choose(s);
    expect(s.screen).toBe("title");
    s.screen = "game-over";
    s.hasSave = false;
    s.menuIndex = 1;
    s = choose(s);
    expect(s.screen).toBe("title");
    s.screen = "victory";
    s.menuIndex = 1;
    s = choose(s);
    expect(s.screen).toBe("title");
    expect(grounded(s)).toBe(false);
  });
});
