import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export interface Assets {
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export interface Point {
  col: number;
  row: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export const bandTint: Record<C.BandName, string> = {
  topsoil: "#af9983",
  rockbed: "#8d9ca2",
  deepstone: "#696c86",
  coreshell: "#a66a69",
};
export const mineralTint = (ore: C.OreId) =>
  [
    "#c0b7a7",
    "#a0b67a",
    "#e79a63",
    "#e2e9ef",
    "#7ca9dc",
    "#d8db70",
    "#83d5cb",
    "#e38c72",
    "#d6636a",
    "#b8a0df",
    "#7ceda4",
    "#f184be",
    "#f6d17c",
  ][C.MINERALS.findIndex((m) => m.id === ore)];
export interface DeepcoreState {
  assets: Assets;
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: Point | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: (Point & { dir: "down" | "left" | "right" }) | null;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  notice: { hazard: C.NoticeHazard; shown: boolean; age: number } | null;
  noticesFired: Record<C.NoticeHazard, boolean>;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  grid: Cell[][];
  drillClock: number;
  hurt: number;
  animationTime: number;
  accumulator: number;
  effects: Effect[];
  cues: C.CueName[];
  shake: number;
  note: string;
  noteTime: number;
  pointerDown: Record<number, string>;
  panelIndex: number;
  launchTime: number | null;
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export const bandAt = (row: number, coreRow: number): C.BandName =>
  C.BANDS[Math.min(3, Math.floor((4 * (row - 1)) / (coreRow - 1)))];
export const minable = (kind: C.TileKind) =>
  ["rock", "ore", "material", "gas", "lava"].includes(kind);
export function cell(kind: C.TileKind, band: C.BandName | null): Cell {
  const health = minable(kind) && band ? C.BAND_HEALTH[band] : null;
  return { kind, band, ore: null, material: null, health, maxHealth: health };
}
export function emptyMine(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, row) =>
    Array.from({ length: C.WORLD_COLS }, (_, col) =>
      cell(
        row === 0
          ? "tunnel"
          : col === 0 || col === C.WORLD_COLS - 1 || row === coreRow
            ? row === coreRow && col === C.CORE_COL
              ? "core"
              : "bedrock"
            : "tunnel",
        row > 0 && row < coreRow ? bandAt(row, coreRow) : null,
      ),
    ),
  );
}
export function tile(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  if (row < 0 && col >= 0 && col < C.WORLD_COLS) return cell("tunnel", null);
  return s.grid[row]?.[col] ?? cell("bedrock", null);
}
export function copy(s: ReadState): DeepcoreState {
  // Structural sharing keeps immutable terrain cheap; a cut replaces its row.
  return {
    ...s,
    assets: s.assets as Assets,
    grid: s.grid as Cell[][],
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    camera: { ...s.camera },
    notice: s.notice ? { ...s.notice } : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    effects: s.effects.map((e) => ({ ...e })),
    cues: [...s.cues],
    pointerDown: { ...s.pointerDown },
  };
}
export function put(
  s: DeepcoreState,
  col: number,
  row: number,
  value: Cell,
): void {
  s.grid = [...s.grid];
  s.grid[row] = [...s.grid[row]];
  s.grid[row][col] = value;
}
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const jetpack = (s: ReadState) => C.JETPACK_TIERS[s.tiers.jetpack - 1];
export const slotCap = (s: ReadState) => C.CARGO_TIERS[s.tiers.cargo - 1];
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.weightKg, 0);
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const minerCell = (s: ReadState): Point => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
});
export function grounded(s: ReadState): boolean {
  const feet = s.miner.y + C.MINER_H;
  const cut = s.miner.drilling;
  if (
    cut?.dir === "down" &&
    minable(tile(s, cut.col, cut.row).kind) &&
    s.miner.x >= cut.col * C.TILE - 0.01 &&
    s.miner.x + C.MINER_W <= (cut.col + 1) * C.TILE + 0.01 &&
    feet >= cut.row * C.TILE - 0.1 &&
    feet <= (cut.row + 1) * C.TILE + 0.1
  )
    return true;
  const row = Math.floor((feet + 0.05) / C.TILE);
  const left = Math.floor((s.miner.x + 0.1) / C.TILE),
    right = Math.floor((s.miner.x + C.MINER_W - 0.1) / C.TILE);
  return (
    Math.abs(feet - row * C.TILE) < 0.1 &&
    (tile(s, left, row).kind !== "tunnel" ||
      tile(s, right, row).kind !== "tunnel")
  );
}
export const buildings = C.BUILDINGS.map((id, i) => ({
  id,
  x: C.TILE + i * 310,
  y: C.SURFACE_Y - 156,
  w: 240,
  h: 156,
}));
export function initial(
  assets: Assets,
  muted = false,
  hasSave = false,
): DeepcoreState {
  return {
    assets,
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow: C.STANDARD_ROWS,
    menuIndex: 0,
    muted,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: -288, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((i) => [i, 0])) as Record<
      C.ItemId,
      number
    >,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    notice: null,
    noticesFired: { gas: false, lava: false },
    summary: null,
    grid: emptyMine(C.STANDARD_ROWS),
    drillClock: 0,
    hurt: 0,
    animationTime: 0,
    accumulator: 0,
    effects: [],
    cues: [],
    shake: 0,
    note: "",
    noteTime: 0,
    pointerDown: {},
    panelIndex: 0,
    launchTime: null,
  };
}
function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function generate(s: DeepcoreState): void {
  const grid = emptyMine(s.coreRow);
  for (let r = 1; r < s.coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      grid[r][c] = cell("rock", bandAt(r, s.coreRow));
  for (let bi = 0; bi < C.BANDS.length; bi++) {
    const band = C.BANDS[bi];
    const points: Point[] = [];
    for (let r = 1; r < s.coreRow; r++)
      if (bandAt(r, s.coreRow) === band)
        for (let c = 1; c < C.WORLD_COLS - 1; c++)
          points.push({ col: c, row: r });
    const count = points.length;
    const avg =
      points.reduce((a, p) => a + (p.row - 1) / (s.coreRow - 1), 0) / count;
    const available = shuffle(
      points.filter(
        (p) =>
          p.col !== C.CAVE_MOUTH_COL &&
          !(p.row === 1 && p.col === C.CAVE_MOUTH_COL),
      ),
    );
    function assign(kind: C.TileKind, n: number) {
      for (let i = 0; i < n; i++) {
        const p = available.pop();
        if (p) grid[p.row][p.col] = cell(kind, band);
      }
    }
    if (bi >= 1) {
      assign(
        "stone",
        Math.round(
          count *
            (C.STONE_DENSITY_MIN +
              ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (avg - 0.25)) /
                0.75),
        ),
      );
      assign(
        "gas",
        Math.round(
          count *
            (C.GAS_DENSITY_MIN +
              ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (avg - 0.25)) / 0.75),
        ),
      );
    }
    if (bi >= 2) {
      let n = Math.round(
        count *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (avg - 0.5)) / 0.5),
      );
      while (n > 0) {
        const seed = available.pop();
        if (!seed) break;
        for (let dy = 0; dy < 2 && n > 0; dy++)
          for (let dx = 0; dx < 3 && n > 0; dx++) {
            const r = seed.row + dy,
              c = seed.col + dx;
            if (
              c > 0 &&
              c < C.WORLD_COLS - 1 &&
              c !== C.CAVE_MOUTH_COL &&
              grid[r]?.[c]?.kind === "rock" &&
              grid[r][c].band === band
            ) {
              grid[r][c] = cell("lava", band);
              n--;
            }
          }
      }
    }
    const ores = shuffle(
      points.filter(
        (p) => p.row >= C.ORE_MIN_ROW && grid[p.row][p.col].kind === "rock",
      ),
    );
    for (
      let i = 0;
      i < Math.round(count * C.ORE_DENSITY) && i < ores.length;
      i++
    ) {
      const p = ores[i],
        f = (p.row - 1) / (s.coreRow - 1);
      const weights = C.MINERALS.map(
        (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
      );
      let draw = Math.random() * weights.reduce((a, b) => a + b, 0),
        index = 0;
      for (; index < weights.length - 1; index++) {
        draw -= weights[index];
        if (draw <= 0) break;
      }
      grid[p.row][p.col] = { ...cell("ore", band), ore: C.MINERALS[index].id };
    }
    const material = C.MATERIALS.find((m) => C.MATERIAL_BAND[m] === band);
    if (material) {
      const p = points[Math.floor(Math.random() * points.length)];
      grid[p.row][p.col] = { ...cell("material", band), material };
      for (
        let c = Math.min(p.col, C.CAVE_MOUTH_COL);
        c <= Math.max(p.col, C.CAVE_MOUTH_COL);
        c++
      )
        if (["lava", "stone"].includes(grid[p.row][c].kind))
          grid[p.row][c] = cell("rock", band);
    }
  }
  // A continuous minable spine and a safe approach to the inexhaustible Core.
  for (let c = C.CORE_COL; c <= C.CAVE_MOUTH_COL; c++)
    if (["lava", "stone"].includes(grid[s.coreRow - 1][c].kind))
      grid[s.coreRow - 1][c] = cell("rock", bandAt(s.coreRow - 1, s.coreRow));
  grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", C.BANDS[0]);
  s.grid = grid;
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  let best: {
    target: C.MaterialId;
    dx: number;
    dy: number;
    dist: number;
  } | null = null;
  if (range !== null) {
    const p = minerCell(s);
    for (let r = 1; r < s.coreRow; r++)
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = s.grid[r][c];
        if (t.material && !s.satchel[t.material]) {
          const dx = c - p.col,
            dy = r - p.row,
            dist = Math.hypot(dx, dy);
          if (dist <= range && (!best || dist < best.dist))
            best = { target: t.material, dx, dy, dist };
        }
      }
  }
  return best
    ? {
        locked: true,
        target: best.target,
        dirX: best.dx / (best.dist || 1),
        dirY: best.dy / (best.dist || 1),
        distanceTiles: best.dist,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
export function snapshot(s: ReadState) {
  const p = minerCell(s),
    drill = s.miner.drilling,
    t = drill ? tile(s, drill.col, drill.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...p,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= jetpack(s).liftLimitKg,
      drilling: drill
        ? {
            ...drill,
            progress:
              t?.health != null && t.maxHealth ? 1 - t.health / t.maxHealth : 0,
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: slotCap(s),
      loadKg: loadKg(s),
      liftLimitKg: jetpack(s).liftLimitKg,
      ore: Object.fromEntries(
        Object.entries(s.cargo).filter(([, n]) => n && n > 0),
      ),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.shown }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export function note(s: DeepcoreState, text: string) {
  s.note = text;
  s.noteTime = 3;
}
export function effect(
  s: DeepcoreState,
  name: string,
  x: number,
  y: number,
  shake = 0,
  tint?: string,
) {
  s.effects.push({
    name,
    x,
    y,
    tint,
    age: 0,
    seed: Math.floor(s.simTime * 10000 + s.effects.length * 37),
  });
  s.shake = Math.max(s.shake, shake);
}
export function resize(s: DeepcoreState, size: C.WorldSize) {
  const old = s.coreRow;
  s.worldSize = size;
  s.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
  const grid = emptyMine(s.coreRow);
  for (let r = 0; r < Math.min(old, s.coreRow); r++)
    grid[r] = s.grid[r] as Cell[];
  s.grid = grid;
}
