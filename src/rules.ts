import * as C from "./constants";
import {
  type DeepcoreState as State,
  type ReadState,
  type Point,
  copy,
  initial,
  generate,
  put,
  tile,
  cell,
  grounded,
  minable,
  maxFuel,
  maxHull,
  jetpack,
  loadKg,
  slots,
  slotCap,
  depth,
  minerCell,
  clamp,
  note,
  effect,
  bandTint,
  mineralTint,
} from "./model";

const SAVE_KEY = "deepcore.expedition.v1";
// Compact tuples keep even Marathon comfortably below browser storage quotas.
// A cell's full health is implied by its preserved band, never its current row.
type SavedCell = [number, number, number, number, number | null];
interface SavePayload {
  format: 1;
  state: Omit<State, "assets" | "grid">;
  terrain: SavedCell[][];
}
export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
export function clearSave(s: State): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
  s.hasSave = false;
}
export function save(s: State): void {
  if (s.coreTimer !== null) {
    note(s, "Cannot save: a Core Sample is destabilizing.");
    return;
  }
  try {
    const { assets: _assets, grid, ...data } = s;
    const terrain: SavedCell[][] = grid.map((row) =>
      row.map((t) => [
        C.TILE_KINDS.indexOf(t.kind),
        t.band ? C.BANDS.indexOf(t.band) : -1,
        t.ore ? C.MINERALS.findIndex((m) => m.id === t.ore) : -1,
        t.material ? C.MATERIALS.indexOf(t.material) : -1,
        t.health,
      ]),
    );
    const payload: SavePayload = { format: 1, state: data, terrain };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    s.hasSave = true;
    note(s, "Expedition secured at the Save Pad.");
  } catch {
    note(s, "Local storage unavailable. Expedition not saved.");
  }
}
export function restore(s: State): State {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return s;
    const payload = JSON.parse(raw) as SavePayload;
    if (
      payload.format !== 1 ||
      payload.terrain.length !== payload.state.coreRow + 1
    )
      throw new Error("Unrecognized save format");
    const grid = payload.terrain.map((row) => {
      if (row.length !== C.WORLD_COLS) throw new Error("Invalid saved terrain");
      return row.map(([kind, band, ore, material, health]) => {
        if (!C.TILE_KINDS[kind]) throw new Error("Invalid saved cell");
        return {
          ...cell(C.TILE_KINDS[kind], C.BANDS[band] ?? null),
          ore: C.MINERALS[ore]?.id ?? null,
          material: C.MATERIALS[material] ?? null,
          health,
        };
      });
    });
    const next = {
      ...initial(s.assets, s.muted, true),
      ...payload.state,
      grid,
      assets: s.assets,
      muted: s.muted,
      simTime: s.simTime,
    };
    next.screen = "in-mine";
    next.panel = null;
    next.menuIndex = 0;
    next.miner = {
      ...next.miner,
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      drilling: null,
    };
    next.coreTimer = null;
    next.coreGround = null;
    next.satchel.coreSample = false;
    next.summary = null;
    next.hasSave = true;
    return next;
  } catch {
    note(s, "The save could not be restored.");
    return s;
  }
}
export function start(s: State): State {
  clearSave(s);
  const n = initial(s.assets, s.muted, false);
  n.mode = s.mode;
  n.worldSize = s.worldSize;
  n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
  generate(n);
  n.screen = "in-mine";
  n.simTime = s.simTime;
  note(n, "Dig. Haul. Build your way off this rock.");
  return n;
}
export function finish(s: State, cause: C.DeathCause | null): void {
  if (s.screen === "game-over" || s.screen === "victory") return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.panel = null;
  s.menuIndex = 0;
  s.satchel.coreSample = false;
  s.coreTimer = null;
  s.coreGround = null;
  if (cause) {
    effect(
      s,
      "death-burst",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
      8,
    );
    s.cues.push(C.CUES.death);
  } else {
    s.cues.push(C.CUES.launch);
    s.launchTime = 0;
    effect(s, "launch-exhaust", 1750, C.SURFACE_Y, 6);
  }
  if (s.mode === "hardcore" || !cause) clearSave(s);
}
export function checkDeath(s: State): void {
  if (s.screen === "in-mine") {
    if (s.miner.hull <= 0) finish(s, "hull-destroyed");
    else if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.1) {
      s.miner.state = "fuel-out";
      finish(s, "fuel-out");
    }
  }
}
export function damage(
  s: State,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, shown: false, age: 0 };
  }
  checkDeath(s);
}
export function gas(s: State, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  effect(s, "gas-explosion", x, y, 16);
  s.cues.push(C.CUES.gasExplosion);
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    const f = (row - 1) / (s.coreRow - 1);
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) * Math.max(0, f - 0.25)) / 0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = d > 0 ? (dy / d) * C.GAS_KNOCKBACK : -C.GAS_KNOCKBACK;
    }
  }
}
export function extract(s: State, col = C.CORE_COL, row = s.coreRow): void {
  if (s.coreTimer !== null) return;
  s.satchel.coreSample = true;
  s.coreTimer = C.CORE_TIMER;
  s.cues.push(C.CUES.materialChime);
  effect(s, "core-extract", col * C.TILE + C.TILE / 2, row * C.TILE, 6);
  note(s, "CORE SAMPLE UNSTABLE — return to the Launch Pad.");
}
export function breakCell(s: State, col: number, row: number): void {
  const t = tile(s, col, row);
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  put(s, col, row, cell("tunnel", t.band));
  if (t.kind === "ore" && t.ore) {
    if (slots(s) < slotCap(s)) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      s.cues.push(C.CUES.orePickup);
      effect(s, "ore-sparkle", x, y, 0, mineralTint(t.ore));
      note(s, `${t.ore.toUpperCase()} +1`);
    } else note(s, "Cargo full — ore lost.");
  }
  if (t.kind === "material" && t.material) {
    s.satchel[t.material]++;
    s.cues.push(C.CUES.materialChime);
    effect(
      s,
      "material-shimmer",
      x,
      y,
      0,
      t.material === "resonite" ? "#68e9c3" : "#94c9ff",
    );
    note(s, `${t.material.toUpperCase()} recovered. Rocket material secured.`);
  }
  if (t.kind === "gas") gas(s, col, row);
  if (t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    s.cues.push(C.CUES.lavaSizzle);
    effect(s, "lava-embers", x, y);
  }
}
export function sell(s: State): void {
  const value = C.MINERALS.reduce(
    (a, m) => a + (s.cargo[m.id] ?? 0) * m.value,
    0,
  );
  s.credits += value;
  s.creditsEarned += value;
  s.cargo = {};
  note(s, `Cargo sold • +${value} Credits`);
  if (value) s.cues.push(C.CUES.fabricate);
}
export function refill(s: State, hull: boolean, full: boolean): void {
  const key = hull ? "hull" : "fuel",
    price = hull ? C.REPAIR_PRICE : C.FUEL_PRICE,
    cap = hull ? maxHull(s) : maxFuel(s),
    increment = hull ? C.REPAIR_BUY_INCREMENT : C.FUEL_BUY_INCREMENT;
  const missing = Math.max(0, cap - s.miner[key]);
  const fixed = Math.min(missing, increment);
  const quantity = full
    ? Math.min(missing, s.credits / price)
    : s.credits >= fixed * price
      ? fixed
      : 0;
  s.miner[key] += quantity;
  s.credits -= quantity * price;
  note(
    s,
    quantity
      ? `${hull ? "Hull repaired" : "Tank charged"} +${quantity.toFixed(0)}`
      : "No purchase — insufficient Credits or already full.",
  );
  if (quantity) s.cues.push(C.CUES.fabricate);
}
export function buyUpgrade(s: State, track: C.TrackName): void {
  const tier = s.tiers[track];
  const price = C.UPGRADE_PRICES[tier - 1];
  if (tier >= C.MAX_TIER[track] || s.credits < price) {
    note(s, "Upgrade unavailable.");
    return;
  }
  const fuel = maxFuel(s),
    hull = maxHull(s);
  s.credits -= price;
  s.tiers[track]++;
  s.miner.fuel += maxFuel(s) - fuel;
  s.miner.hull += maxHull(s) - hull;
  s.cues.push(C.CUES.fabricate);
  note(s, `${track.toUpperCase()} upgraded to tier ${tier + 1}`);
}
export function buyItem(s: State, id: C.ItemId): void {
  const item = C.ITEMS.find((i) => i.id === id)!;
  if (s.credits < item.price) {
    note(s, "Not enough Credits.");
    return;
  }
  s.credits -= item.price;
  s.items[id]++;
  s.cues.push(C.CUES.fabricate);
  note(s, `${item.name} acquired.`);
}
export function useItem(s: State, id: C.ItemId): void {
  if (s.items[id] <= 0) {
    note(s, "No supply held.");
    return;
  }
  const p = minerCell(s);
  let changed = true;
  switch (id) {
    case "dynamite":
    case "plastic-explosives": {
      const radius =
        id === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
      changed = false;
      for (
        let r = Math.max(1, p.row - radius);
        r <= Math.min(s.coreRow - 1, p.row + radius);
        r++
      )
        for (
          let c = Math.max(1, p.col - radius);
          c <= Math.min(C.WORLD_COLS - 2, p.col + radius);
          c++
        ) {
          const t = tile(s, c, r);
          if (["rock", "ore", "lava", "stone", "gas"].includes(t.kind)) {
            changed = true;
            put(s, c, r, cell("tunnel", t.band));
            if (t.kind === "gas") gas(s, c, r);
          }
        }
      if (changed) {
        effect(
          s,
          "gas-explosion",
          s.miner.x + C.MINER_W / 2,
          s.miner.y + C.MINER_H / 2,
          16,
        );
        s.cues.push(C.CUES.gasExplosion);
      }
      break;
    }
    case "quantum-teleporter":
    case "matter-transmitter": {
      const quantum = id === "quantum-teleporter";
      const h = quantum
        ? (s.nextTeleportHeight ??
          C.TELEPORT_HEIGHT_TILES_MIN +
            Math.random() *
              (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN))
        : 0;
      const x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
        y = C.SURFACE_Y - C.MINER_H - h * C.TILE;
      const vy = quantum
        ? (s.nextTeleportSpeed ??
          C.TELEPORT_SPEED_MIN +
            Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN))
        : 0;
      changed =
        s.miner.x !== x ||
        s.miner.y !== y ||
        s.miner.vx !== 0 ||
        s.miner.vy !== vy;
      if (!changed) break;
      s.miner.x = x;
      s.miner.y = y;
      s.miner.vx = 0;
      s.miner.vy = vy;
      s.miner.drilling = null;
      if (quantum) {
        s.nextTeleportHeight = null;
        s.nextTeleportSpeed = null;
      }
      effect(s, "core-extract", s.miner.x, s.miner.y);
      break;
    }
    case "nanobots":
      changed = s.miner.hull < maxHull(s);
      if (changed)
        s.miner.hull = Math.min(maxHull(s), s.miner.hull + C.NANOBOT_HULL);
      break;
    case "emergency-fuel":
      changed = s.miner.fuel < maxFuel(s);
      if (changed)
        s.miner.fuel = Math.min(maxFuel(s), s.miner.fuel + C.EMERGENCY_FUEL);
      break;
  }
  if (changed) {
    if (id === "nanobots" || id === "emergency-fuel")
      effect(
        s,
        "material-shimmer",
        s.miner.x + C.MINER_W / 2,
        s.miner.y + C.MINER_H / 2,
        0,
        id === "nanobots" ? "#83ffe1" : "#ffe6ab",
      );
    s.items[id]--;
    s.cues.push(C.CUES.fabricate);
    note(s, "Field supply deployed.");
  } else note(s, "That supply would change nothing.");
  checkDeath(s);
}
export function jettison(s: State): void {
  if (s.satchel.coreSample) {
    s.satchel.coreSample = false;
    s.coreGround = minerCell(s);
    note(s, "Sample jettisoned. Move clear of the blast!");
  }
}
export function canFabricate(s: ReadState): boolean {
  const part = C.ROCKET_COMPONENTS[s.installed];
  return (
    !!part &&
    s.credits >= part.credits &&
    (part.material === null ||
      (part.material === "core-sample"
        ? s.satchel.coreSample
        : s.satchel[part.material] > 0))
  );
}
export function fabricate(s: State): void {
  if (!canFabricate(s)) {
    note(s, "Fabrication needs more Credits or its exotic material.");
    return;
  }
  const part = C.ROCKET_COMPONENTS[s.installed];
  s.credits -= part.credits;
  if (part.material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (part.material) s.satchel[part.material]--;
  s.installed++;
  s.cues.push(C.CUES.fabricate);
  note(s, `${part.name} installed. ${s.installed}/5 complete.`);
}
export function launch(s: State): void {
  if (s.installed === C.ROCKET_COMPONENT_IDS.length) finish(s, null);
  else note(s, "Complete all five rocket components first.");
}

export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
function overlaps(
  s: ReadState,
  x: number,
  y: number,
  ignore: Point | null,
): boolean {
  const left = Math.floor((x + 0.01) / C.TILE),
    right = Math.floor((x + C.MINER_W - 0.01) / C.TILE),
    top = Math.floor((y + 0.01) / C.TILE),
    bottom = Math.floor((y + C.MINER_H - 0.01) / C.TILE);
  for (let r = top; r <= bottom; r++)
    for (let c = left; c <= right; c++)
      if (
        !(ignore && ignore.col === c && ignore.row === r) &&
        tile(s, c, r).kind !== "tunnel"
      )
        return true;
  return false;
}
function move(s: State, dx: number, dy: number, ignore: Point | null): void {
  const m = s.miner;
  if (dx) {
    const target = m.x + dx;
    if (!overlaps(s, target, m.y, ignore)) m.x = target;
    else {
      const col =
        dx > 0
          ? Math.floor((target + C.MINER_W - 0.01) / C.TILE)
          : Math.floor((target + 0.01) / C.TILE);
      m.x = dx > 0 ? col * C.TILE - C.MINER_W : (col + 1) * C.TILE;
      m.vx = 0;
    }
  }
  if (dy) {
    const target = m.y + dy;
    const foot = {
      col: Math.floor((m.x + C.MINER_W / 2) / C.TILE),
      row: Math.floor((m.y + C.MINER_H - 0.01) / C.TILE),
    };
    // Thrust may withdraw the bit from an unfinished down-cut. Its face stays
    // damaged, but is not a ceiling that can trap the miner inside the cut.
    const withdrawing =
      dy < 0 &&
      minable(tile(s, foot.col, foot.row).kind) &&
      m.y + C.MINER_H > foot.row * C.TILE + 0.01;
    if (!overlaps(s, m.x, target, ignore ?? (withdrawing ? foot : null)))
      m.y = target;
    else {
      const row =
        dy > 0
          ? Math.floor((target + C.MINER_H - 0.01) / C.TILE)
          : Math.floor((target + 0.01) / C.TILE);
      m.y = dy > 0 ? row * C.TILE - C.MINER_H : (row + 1) * C.TILE;
      if (dy > 0 && m.vy > C.IMPACT_SAFE_SPEED) {
        const d = (m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
        damage(s, d);
        effect(
          s,
          "impact-dust",
          m.x + C.MINER_W / 2,
          m.y + C.MINER_H,
          Math.max(3, d / 3),
        );
        s.cues.push(C.CUES.impact);
      }
      m.vy = 0;
    }
  }
}
export function simulate(s: State, h: Held, dt: number): void {
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (s.coreTimer !== null) {
    s.coreTimer -= dt;
    if (s.coreTimer <= 0) {
      const p = s.coreGround;
      effect(
        s,
        "core-detonation",
        p ? (p.col + 0.5) * C.TILE : s.miner.x,
        p ? (p.row + 0.5) * C.TILE : s.miner.y,
        30,
      );
      s.cues.push(C.CUES.gasExplosion);
      const lethal =
        s.satchel.coreSample ||
        (!!p &&
          Math.hypot(
            s.miner.x + C.MINER_W / 2 - (p.col + 0.5) * C.TILE,
            s.miner.y + C.MINER_H / 2 - (p.row + 0.5) * C.TILE,
          ) <=
            C.CORE_BLAST_TILES * C.TILE);
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (lethal) finish(s, "core-detonation");
    }
  }
  if (s.screen !== "in-mine") return;
  if (s.notice) {
    s.notice.age += dt;
    s.notice.shown = s.notice.age + 1e-9 >= C.NOTICE_DELAY;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  s.hurt = Math.max(0, s.hurt - dt);
  if (!s.panel) {
    const m = s.miner;
    const onGround = grounded(s);
    const thrust = h.up > 0 && m.fuel > 0;
    const dir = h.right - h.left;
    if (dir) m.facing = dir > 0 ? "east" : "west";
    let target: (Point & { dir: "down" | "left" | "right" }) | null = null;
    if (onGround && !thrust && m.drill && m.fuel >= C.DRILL_HIT_FUEL) {
      const p = minerCell(s),
        feet = m.y + C.MINER_H;
      if (h.down) {
        const continuing =
          m.drilling?.dir === "down" &&
          m.drilling.col === p.col &&
          feet >= m.drilling.row * C.TILE - 0.1 &&
          feet <= (m.drilling.row + 1) * C.TILE + 0.1;
        const row =
          continuing && m.drilling
            ? m.drilling.row
            : Math.floor((feet + 0.1) / C.TILE);
        if (
          m.x >= p.col * C.TILE - 0.01 &&
          m.x + C.MINER_W <= (p.col + 1) * C.TILE + 0.01
        )
          target = { col: p.col, row, dir: "down" };
        else if (s.noteTime <= 0)
          note(s, "Align the drill over one tile with A / D.");
      } else if (
        dir > 0 &&
        Math.abs(
          (m.x + C.MINER_W) / C.TILE - Math.round((m.x + C.MINER_W) / C.TILE),
        ) < 0.01
      )
        target = {
          col: Math.round((m.x + C.MINER_W) / C.TILE),
          row: Math.floor((m.y + C.MINER_H / 2) / C.TILE),
          dir: "right",
        };
      else if (
        dir < 0 &&
        Math.abs(m.x / C.TILE - Math.round(m.x / C.TILE)) < 0.01
      )
        target = {
          col: Math.round(m.x / C.TILE) - 1,
          row: Math.floor((m.y + C.MINER_H / 2) / C.TILE),
          dir: "left",
        };
      if (target) {
        const t = tile(s, target.col, target.row);
        if (
          !minable(t.kind) &&
          !(target.dir === "down" && t.kind === "core" && s.coreTimer === null)
        )
          target = null;
      }
    }
    if (
      m.travel &&
      !thrust &&
      m.drilling?.dir === "down" &&
      target?.dir !== "down" &&
      m.x >= m.drilling.col * C.TILE - 0.01 &&
      m.x + C.MINER_W <= (m.drilling.col + 1) * C.TILE + 0.01 &&
      m.y + C.MINER_H > m.drilling.row * C.TILE &&
      m.y + C.MINER_H <= (m.drilling.row + 1) * C.TILE + 0.1
    ) {
      // Releasing a braced cut withdraws the tool onto its exposed lip. Never
      // resolve a partially embedded body as though the floor were a side wall.
      m.y = m.drilling.row * C.TILE - C.MINER_H;
      m.vy = 0;
      target = null;
    }
    if (target) {
      if (
        !m.drilling ||
        target.col !== m.drilling.col ||
        target.row !== m.drilling.row ||
        target.dir !== m.drilling.dir
      )
        s.drillClock = 0;
      m.drilling = target;
      s.drillClock += dt;
      while (
        s.drillClock + 1e-9 >= C.DRILL_HIT_INTERVAL &&
        m.fuel >= C.DRILL_HIT_FUEL
      ) {
        s.drillClock -= C.DRILL_HIT_INTERVAL;
        m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
        const t = tile(s, target.col, target.row);
        if (t.kind === "core") {
          extract(s, target.col, target.row);
          m.drilling = null;
          break;
        }
        const health =
          (t.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
        if (health <= 0) {
          breakCell(s, target.col, target.row);
          if (
            m.travel &&
            target.dir === "down" &&
            tile(s, target.col, target.row + 1).kind !== "tunnel" &&
            tile(s, target.col, target.row + 1).kind !== "lava"
          ) {
            m.y = (target.row + 1) * C.TILE - C.MINER_H;
            m.vy = 0;
          }
          m.drilling = null;
          break;
        } else put(s, target.col, target.row, { ...t, health });
      }
      if (
        m.travel &&
        m.drilling &&
        target.dir === "down" &&
        !["tunnel", "lava"].includes(tile(s, target.col, target.row + 1).kind)
      ) {
        const t = tile(s, target.col, target.row);
        if (t.health !== null && t.maxHealth) {
          // Ease the body through each bite; only completed hits alter terrain
          // health or spend drill fuel. The final partial bite takes a full beat.
          const nextBite = Math.min(
            t.health,
            C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1],
          );
          const progress =
            1 -
            t.health / t.maxHealth +
            ((s.drillClock / C.DRILL_HIT_INTERVAL) * nextBite) / t.maxHealth;
          m.y = target.row * C.TILE - C.MINER_H + progress * C.TILE;
        }
      }
      if (
        Math.floor(s.elapsedSeconds * 24) !==
        Math.floor((s.elapsedSeconds - dt) * 24)
      )
        effect(
          s,
          "drill-debris",
          target.dir === "down"
            ? m.x + C.MINER_W / 2
            : target.dir === "right"
              ? m.x + C.MINER_W
              : m.x,
          target.dir === "down" ? m.y + C.MINER_H : m.y + C.MINER_H / 2,
          0,
          bandTint[tile(s, target.col, target.row).band ?? "topsoil"],
        );
    } else {
      m.drilling = null;
      s.drillClock = 0;
    }
    if (m.travel) {
      if (s.hurt <= 0) m.vx = dir * C.WALK_SPEED;
      const load = loadKg(s) / jetpack(s).liftLimitKg;
      if (thrust)
        m.vy = Math.max(
          -jetpack(s).emptyClimb *
            (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - jetpack(s).emptyAccel * Math.max(0, 1 - load) * dt,
        );
      else if (!m.drilling)
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
      if (!m.drilling || m.drilling.dir !== "down")
        move(s, m.vx * dt, m.vy * dt, null);
      else move(s, m.vx * dt, 0, m.drilling);
    }
    let burn = 0;
    if (thrust) {
      burn +=
        (C.THRUST_BURN_MAX +
          (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
            Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
        C.THRUST_BURN_SIZE_MULT[s.worldSize];
      if (
        Math.floor(s.elapsedSeconds * 20) !==
        Math.floor((s.elapsedSeconds - dt) * 20)
      )
        effect(s, "jetpack-exhaust", m.x + 8, m.y + C.MINER_H - 8);
    }
    if (dir && !onGround) burn += C.AIR_BURN;
    if (m.y + C.MINER_H > C.SURFACE_Y + 0.1) burn += C.LIFE_SUPPORT_BURN;
    m.fuel = Math.max(0, m.fuel - burn * dt);
    const p = minerCell(s);
    let touchingLava = false;
    for (
      let r = Math.max(1, Math.floor(m.y / C.TILE));
      r <= Math.floor((m.y + C.MINER_H + 0.05) / C.TILE);
      r++
    )
      for (
        let c = Math.floor(m.x / C.TILE);
        c <= Math.floor((m.x + C.MINER_W - 0.01) / C.TILE);
        c++
      )
        if (
          tile(s, c, r).kind === "lava" &&
          !(m.drilling?.col === c && m.drilling.row === r)
        )
          touchingLava = true;
    if (touchingLava) {
      damage(
        s,
        C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
        "lava",
      );
      if (
        Math.floor(s.elapsedSeconds * 5) !==
        Math.floor((s.elapsedSeconds - dt) * 5)
      ) {
        effect(s, "lava-embers", p.col * C.TILE, m.y + C.MINER_H);
        s.cues.push(C.CUES.lavaSizzle);
      }
    }
    const nextState: C.MinerState = m.drilling
      ? m.drilling.dir === "down"
        ? "drill-down"
        : "drill-side"
      : s.hurt > 0
        ? "hurt"
        : m.fuel <= 0 && m.y + C.MINER_H > C.SURFACE_Y
          ? "fuel-out"
          : thrust
            ? "jetpack"
            : !grounded(s) && m.vy > 0
              ? "fall"
              : dir && grounded(s) && m.travel
                ? "walk"
                : "idle";
    if (nextState !== m.state) s.animationTime = 0;
    else s.animationTime += dt;
    m.state = nextState;
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  checkDeath(s);
  const m = s.miner,
    target =
      Math.abs(m.vy) <= C.CAM_STILL_SPEED
        ? 0
        : Math.sign(m.vy) * C.CAM_LEAD_MAX;
  const rate =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (s.camera.lead !== 0 &&
    (Math.sign(target) !== Math.sign(s.camera.lead) ||
      Math.abs(target) < Math.abs(s.camera.lead))
      ? C.CAM_UNWIND_MULT
      : 1);
  s.camera.lead += clamp(target - s.camera.lead, -rate * dt, rate * dt);
  s.camera.x = clamp(
    m.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
    m.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
  );
}
export const transition = (s: ReadState, fn: (next: State) => void): State => {
  const n = copy(s);
  fn(n);
  return n;
};
