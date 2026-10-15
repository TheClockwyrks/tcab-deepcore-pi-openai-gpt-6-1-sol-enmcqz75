import * as C from "./constants";
import {
  type ReadState,
  type DeepcoreState as State,
  type Cell,
  initial,
  copy,
  cell,
  tile,
  bandAt,
  put,
  generate,
  resize,
  snapshot,
  buildings,
  maxFuel,
  maxHull,
  minerCell,
} from "./model";
import {
  transition,
  sell,
  refill,
  buyUpgrade,
  buyItem,
  useItem,
  jettison,
  fabricate,
  launch,
  save,
  clearSave,
} from "./rules";
import { menuItems, menuRect, controlRect } from "./interface";

function valid(
  condition: boolean,
  message = "invalid argument",
): asserts condition {
  if (!condition) throw new RangeError(`Deepcore: ${message}`);
}
function number(
  n: number,
  lo = -Infinity,
  hi = Infinity,
  integer = false,
): void {
  valid(
    Number.isFinite(n) &&
      n >= lo &&
      n <= hi &&
      (!integer || Number.isInteger(n)),
  );
}
function member<T extends string>(value: T, values: readonly string[]): void {
  valid(values.includes(value), `unknown identifier ${value}`);
}
function coordinate(s: ReadState, c: number, r: number): void {
  number(c, 0, C.WORLD_COLS - 1, true);
  number(r, 1, s.coreRow, true);
}
function poseTile(s: ReadState, c: number, r: number, value: Cell): State {
  coordinate(s, c, r);
  return transition(s, (n) => put(n, c, r, value));
}
function field<K extends keyof State>(
  s: ReadState,
  key: K,
  value: State[K],
): State {
  return { ...copy(s), [key]: value };
}
export const debug = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt: (s: ReadState, c: number, r: number) => ({
    ...(r < 0 ||
    r > s.coreRow ||
    c < 0 ||
    c >= C.WORLD_COLS ||
    !Number.isInteger(c) ||
    !Number.isInteger(r)
      ? cell("bedrock", null)
      : tile(s, c, r)),
  }),
  findTile(s: ReadState, kind: C.TileKind) {
    member(kind, C.TILE_KINDS);
    let found: { col: number; row: number } | null = null,
      distance = Infinity;
    const p = minerCell(s);
    for (let r = 0; r <= s.coreRow; r++)
      for (let c = 0; c < C.WORLD_COLS; c++)
        if (tile(s, c, r).kind === kind) {
          const d = Math.hypot(c - p.col, r - p.row);
          if (d < distance) {
            distance = d;
            found = { col: c, row: r };
          }
        }
    return found;
  },
  buildings: (_s: ReadState) => buildings.map((b) => ({ ...b })),
  menuItemRect: menuRect,
  controlRect(s: ReadState, control: string, subject: string | null) {
    member(control, [
      "drop-ore",
      "use-item",
      "jettison",
      "sell",
      "buy-fuel",
      "fill-fuel",
      "buy-repair",
      "repair-full",
      "buy-upgrade",
      "buy-item",
      "fabricate",
      "launch",
      "dismiss-notice",
      "inventory",
      "pause",
      "mute",
    ]);
    if (control === "drop-ore")
      valid(
        subject !== null &&
          [...C.ORE_IDS, ...C.GEMSTONE_IDS].some((id) => id === subject),
      );
    else if (control === "buy-upgrade")
      valid(subject !== null && C.TRACKS.some((id) => id === subject));
    else if (control === "use-item" || control === "buy-item")
      valid(subject !== null && C.ITEM_IDS.some((id) => id === subject));
    else valid(subject === null);
    return controlRect(s, control, subject);
  },
  reset: (s: ReadState) =>
    initial(s.assets as State["assets"], s.muted, s.hasSave),
  reconcile: (s: ReadState) => copy(s),
  generateMine: (s: ReadState) => transition(s, generate),
  clearMine: (s: ReadState) =>
    transition(s, (n) => {
      n.grid = s.grid.map((row, r) =>
        r === 0 || r === s.coreRow
          ? [...row]
          : row.map((t, c) =>
              c === 0 || c === C.WORLD_COLS - 1 ? t : cell("tunnel", t.band),
            ),
      ) as State["grid"];
    }),
  clearCargo: (s: ReadState) => field(s, "cargo", {}),
  clearItems: (s: ReadState) =>
    field(
      s,
      "items",
      Object.fromEntries(C.ITEM_IDS.map((id) => [id, 0])) as State["items"],
    ),
  setTile(
    s: ReadState,
    c: number,
    r: number,
    kind: Exclude<C.TileKind, "ore" | "material">,
  ) {
    member(kind, ["rock", "gas", "lava", "stone", "bedrock", "tunnel", "core"]);
    return poseTile(s, c, r, cell(kind, bandAt(r, s.coreRow)));
  },
  setOreTile(s: ReadState, c: number, r: number, ore: C.OreId) {
    member(ore, [...C.ORE_IDS, ...C.GEMSTONE_IDS]);
    return poseTile(s, c, r, { ...cell("ore", bandAt(r, s.coreRow)), ore });
  },
  setMaterialTile(s: ReadState, c: number, r: number, material: C.MaterialId) {
    member(material, C.MATERIALS);
    return poseTile(s, c, r, {
      ...cell("material", bandAt(r, s.coreRow)),
      material,
    });
  },
  setTileHealth(s: ReadState, c: number, r: number, health: number) {
    coordinate(s, c, r);
    const t = tile(s, c, r);
    valid(t.maxHealth !== null, "cell is not minable");
    number(health, Number.MIN_VALUE, t.maxHealth);
    return poseTile(s, c, r, { ...t, health });
  },
  placeCoreSample(s: ReadState, c: number, r: number) {
    coordinate(s, c, r);
    valid(
      s.coreTimer === null && tile(s, c, r).kind === "tunnel",
      "sample requires an open cell and no live sample",
    );
    return transition(s, (n) => {
      n.coreGround = { col: c, row: r };
      n.coreTimer = C.CORE_TIMER;
    });
  },
  setMinerPosition(s: ReadState, x: number, y: number) {
    number(x);
    number(y);
    return transition(s, (n) => {
      n.miner.x = x;
      n.miner.y = y;
    });
  },
  setMinerVelocity(s: ReadState, vx: number, vy: number) {
    number(vx);
    number(vy);
    return transition(s, (n) => {
      n.miner.vx = vx;
      n.miner.vy = vy;
    });
  },
  setFacing(s: ReadState, facing: C.Facing) {
    member(facing, C.FACINGS);
    return transition(s, (n) => {
      n.miner.facing = facing;
    });
  },
  setFuel(s: ReadState, value: number) {
    number(value, 0);
    return transition(s, (n) => {
      n.miner.fuel = value;
    });
  },
  setHull(s: ReadState, value: number) {
    number(value, 0);
    return transition(s, (n) => {
      n.miner.hull = value;
    });
  },
  setMinerTravel(s: ReadState, enabled: boolean) {
    valid(typeof enabled === "boolean");
    return transition(s, (n) => {
      n.miner.travel = enabled;
    });
  },
  setMinerDrill(s: ReadState, enabled: boolean) {
    valid(typeof enabled === "boolean");
    return transition(s, (n) => {
      n.miner.drill = enabled;
    });
  },
  setScreen(s: ReadState, screen: C.ScreenName) {
    member(screen, C.SCREENS);
    return field(s, "screen", screen);
  },
  setPanel(s: ReadState, panel: C.PanelId | null) {
    if (panel !== null) member(panel, C.PANELS);
    return field(s, "panel", panel);
  },
  setMenuIndex(s: ReadState, index: number) {
    number(index, 0, menuItems(s).length - 1, true);
    return field(s, "menuIndex", index);
  },
  setMode(s: ReadState, mode: C.Mode) {
    member(mode, C.MODES);
    return field(s, "mode", mode);
  },
  setWorldSize(s: ReadState, size: C.WorldSize) {
    member(size, C.WORLD_SIZES);
    return transition(s, (n) => resize(n, size));
  },
  setCredits(s: ReadState, value: number) {
    number(value, 0);
    return field(s, "credits", value);
  },
  setTier(s: ReadState, track: C.TrackName, tier: number) {
    member(track, C.TRACKS);
    number(tier, 1, C.MAX_TIER[track], true);
    return transition(s, (n) => {
      n.tiers[track] = tier;
      n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
      n.miner.hull = Math.min(n.miner.hull, maxHull(n));
    });
  },
  setCargo(s: ReadState, ore: C.OreId, count: number) {
    member(ore, [...C.ORE_IDS, ...C.GEMSTONE_IDS]);
    number(count, 0, Infinity, true);
    return transition(s, (n) => {
      n.cargo[ore] = count;
    });
  },
  setMaterial(s: ReadState, material: C.MaterialId, count: number) {
    member(material, C.MATERIALS);
    number(count, 0, Infinity, true);
    return transition(s, (n) => {
      n.satchel[material] = count;
    });
  },
  setCoreCarried(s: ReadState, carried: boolean) {
    valid(typeof carried === "boolean");
    if (carried) valid(s.coreTimer === null, "a sample is already live");
    return transition(s, (n) => {
      n.satchel.coreSample = carried;
      if (carried) n.coreTimer = C.CORE_TIMER;
      else if (!n.coreGround) n.coreTimer = null;
    });
  },
  setCoreTimer(s: ReadState, seconds: number) {
    valid(s.coreTimer !== null, "no live sample");
    number(seconds, Number.MIN_VALUE);
    return field(s, "coreTimer", seconds);
  },
  setItemCount(s: ReadState, item: C.ItemId, count: number) {
    member(item, C.ITEM_IDS);
    number(count, 0, Infinity, true);
    return transition(s, (n) => {
      n.items[item] = count;
    });
  },
  setRocketInstalled(s: ReadState, count: number) {
    number(count, 0, C.ROCKET_COMPONENT_IDS.length, true);
    return field(s, "installed", count);
  },
  setNoticeFired(s: ReadState, hazard: C.NoticeHazard, fired: boolean) {
    member(hazard, C.NOTICE_HAZARDS);
    valid(typeof fired === "boolean");
    return transition(s, (n) => {
      n.noticesFired[hazard] = fired;
    });
  },
  setCameraLead(s: ReadState, lead: number) {
    number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
    return transition(s, (n) => {
      n.camera.lead = lead;
    });
  },
  setElapsed(s: ReadState, seconds: number) {
    number(seconds, 0);
    return field(s, "elapsedSeconds", seconds);
  },
  clearSave: (s: ReadState) => transition(s, clearSave),
  setNextTeleportHeight(s: ReadState, value: number | null) {
    if (value !== null)
      number(value, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
    return field(s, "nextTeleportHeight", value);
  },
  setNextTeleportSpeed(s: ReadState, value: number | null) {
    if (value !== null)
      number(value, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
    return field(s, "nextTeleportSpeed", value);
  },
  dropOre(s: ReadState, ore: C.OreId) {
    member(ore, [...C.ORE_IDS, ...C.GEMSTONE_IDS]);
    return transition(s, (n) => {
      n.cargo[ore] = Math.max(0, (n.cargo[ore] ?? 0) - 1);
    });
  },
  sell: (s: ReadState) => transition(s, sell),
  buyFuel: (s: ReadState) => transition(s, (n) => refill(n, false, false)),
  fillFuel: (s: ReadState) => transition(s, (n) => refill(n, false, true)),
  buyRepair: (s: ReadState) => transition(s, (n) => refill(n, true, false)),
  repairFull: (s: ReadState) => transition(s, (n) => refill(n, true, true)),
  buyUpgrade(s: ReadState, track: C.TrackName) {
    member(track, C.TRACKS);
    return transition(s, (n) => buyUpgrade(n, track));
  },
  buyItem(s: ReadState, item: C.ItemId) {
    member(item, C.ITEM_IDS);
    return transition(s, (n) => buyItem(n, item));
  },
  useItem(s: ReadState, item: C.ItemId) {
    member(item, C.ITEM_IDS);
    return transition(s, (n) => useItem(n, item));
  },
  jettison: (s: ReadState) => transition(s, jettison),
  fabricate: (s: ReadState) => transition(s, fabricate),
  launch: (s: ReadState) => transition(s, launch),
  save: (s: ReadState) => transition(s, save),
  dismissNotice: (s: ReadState) => field(s, "notice", null),
};
export type DeepcoreDebugApi = typeof debug;
