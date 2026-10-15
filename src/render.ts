import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  tile,
  buildings,
  depth,
  loadKg,
  slots,
  slotCap,
  jetpack,
  maxFuel,
  maxHull,
  scanner,
} from "./model";
import {
  controls,
  menuItems,
  menuRect,
  panelSubtitle,
  buildingAt,
} from "./interface";

type Context = CanvasRenderingContext2D;
const P = {
  ink: "#0b1822",
  panel: "#10232eee",
  line: "#37515d",
  text: "#e6e2d1",
  muted: "#8ca6ad",
  amber: "#e9ba72",
  cyan: "#83d5ce",
  red: "#f28c76",
};
export function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = P.text,
  font = "monospace",
): void {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.fillText(value, x, y);
}
function box(ctx: Context, r: Rect, fill = P.panel, stroke = P.line) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
function image(
  s: ReadState,
  ctx: Context,
  path: string,
  x: number,
  y: number,
  w?: number,
  h?: number,
) {
  const bitmap = s.assets.images[path];
  if (bitmap)
    ctx.drawImage(bitmap, x, y, w ?? bitmap.width, h ?? bitmap.height);
}
function supplyIcon(ctx: Context, index: number, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  if (index === 0) {
    ctx.fillStyle = P.red;
    for (let i = 0; i < 3; i++) ctx.fillRect(i * 6, 3, 4, 17);
    ctx.strokeStyle = P.amber;
    ctx.beginPath();
    ctx.moveTo(8, 3);
    ctx.lineTo(12, -3);
    ctx.lineTo(18, -2);
    ctx.stroke();
    ctx.fillStyle = P.text;
    ctx.fillRect(0, 10, 16, 3);
  } else if (index === 1) {
    ctx.fillStyle = "#8da6b0";
    ctx.fillRect(0, 4, 17, 15);
    ctx.fillStyle = P.ink;
    ctx.fillRect(3, 8, 11, 7);
    ctx.strokeStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(19, 0);
    ctx.lineTo(21, 13);
    ctx.stroke();
  } else if (index === 2 || index === 3) {
    ctx.strokeStyle = index === 2 ? "#c3a0e9" : P.cyan;
    ctx.beginPath();
    ctx.ellipse(9, 11, 8, 11, index === 2 ? 0.5 : 0, 0, Math.PI * 2);
    ctx.moveTo(3, 11);
    ctx.lineTo(15, 11);
    ctx.moveTo(9, 4);
    ctx.lineTo(9, 18);
    ctx.stroke();
  } else if (index === 4) {
    ctx.fillStyle = P.cyan;
    ctx.fillRect(6, 1, 6, 20);
    ctx.fillRect(0, 8, 18, 6);
    ctx.fillStyle = P.text;
    for (const [dx, dy] of [
      [-2, 0],
      [17, 19],
      [20, 1],
    ])
      ctx.fillRect(dx, dy, 2, 2);
  } else {
    ctx.fillStyle = P.amber;
    ctx.fillRect(2, 4, 15, 17);
    ctx.fillRect(6, 0, 7, 5);
    ctx.fillStyle = P.ink;
    ctx.fillRect(7, 9, 5, 8);
    ctx.fillStyle = P.text;
    ctx.fillRect(2, 6, 3, 8);
  }
  ctx.restore();
}
function button(
  ctx: Context,
  label: string,
  detail: string,
  r: Rect,
  selected: boolean,
  enabled = true,
  supply = -1,
) {
  box(
    ctx,
    r,
    selected ? "#2d4a53" : enabled ? "#172f3b" : "#152731",
    selected ? P.amber : P.line,
  );
  if (selected) {
    ctx.fillStyle = P.amber;
    ctx.fillRect(r.x, r.y, 4, r.h);
  }
  if (supply >= 0) {
    ctx.globalAlpha = enabled ? 1 : 0.35;
    supplyIcon(ctx, supply, r.x + 14, r.y + r.h / 2 - 11);
    ctx.globalAlpha = 1;
  }
  text(
    ctx,
    label,
    r.x + (supply >= 0 ? 44 : 17),
    r.y + r.h / 2 + 6,
    r.h < 39 ? 13 : 16,
    enabled ? (selected ? P.amber : P.text) : "#536d78",
  );
  if (detail) {
    ctx.textAlign = "right";
    text(
      ctx,
      detail,
      r.x + r.w - 16,
      r.y + r.h / 2 + 5,
      r.h < 39 ? 11 : 13,
      enabled ? P.muted : "#536d78",
    );
    ctx.textAlign = "left";
  }
}
function passage(
  s: ReadState,
  ctx: Context,
  col: number,
  row: number,
  kind: "tunnel" | "lava",
) {
  const x = col * C.TILE,
    y = row * C.TILE,
    inset = 7,
    r = 16;
  const same = (c: number, r: number) =>
    tile(s, c, r).kind === kind || (kind === "tunnel" && r <= 0);
  const l = same(col - 1, row),
    right = same(col + 1, row),
    up = same(col, row - 1),
    down = same(col, row + 1);
  const x0 = x + (l ? 0 : inset),
    y0 = y + (up ? 0 : inset),
    w = C.TILE - (l ? 0 : inset) - (right ? 0 : inset),
    h = C.TILE - (up ? 0 : inset) - (down ? 0 : inset);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, [
    !l && !up ? r : 0,
    !right && !up ? r : 0,
    !right && !down ? r : 0,
    !l && !down ? r : 0,
  ]);
  ctx.clip();
  image(
    s,
    ctx,
    kind === "tunnel"
      ? "tiles/tunnel.png"
      : `hazards/lava/frame0${Math.floor(s.elapsedSeconds * 5) % 4}.png`,
    x,
    y,
    C.TILE,
    C.TILE,
  );
  ctx.restore();
  // Solid diagonals keep a convex dirt nub, rather than scooping a notch.
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    if (
      same(col + dx, row) &&
      same(col, row + dy) &&
      !same(col + dx, row + dy)
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, C.TILE, C.TILE);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(
        x + (dx > 0 ? C.TILE : 0),
        y + (dy > 0 ? C.TILE : 0),
        inset,
        0,
        Math.PI * 2,
      );
      ctx.clip();
      const b = tile(s, col, row).band ?? "topsoil";
      image(
        s,
        ctx,
        `tiles/${b}-${(col + row) % C.TILE_VARIANTS}.png`,
        x,
        y,
        C.TILE,
        C.TILE,
      );
      ctx.restore();
    }
}
function particles(
  s: ReadState,
  ctx: Context,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
  tint?: string,
) {
  const original = s.assets.systems[name];
  if (!original) return;
  const system = tint
    ? {
        ...original,
        emitters: original.emitters.map((e) => ({
          ...e,
          particle: {
            ...e.particle,
            colorGradient: [
              { color: tint, at: 0 },
              { color: tint, at: 1 },
            ],
          },
        })),
      }
    : original;
  // The runtime fits to its context's field. This facade keeps field units equal
  // to logical world units, independent of the engine's device-pixel backing.
  let ready = false;
  const facade = new Proxy(ctx, {
    get(target, key) {
      if (key === "canvas") return { width: 480, height: 480 };
      if (key === "fill" && !ready) return () => undefined;
      const v = Reflect.get(target, key, target) as unknown;
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  ctx.save();
  ctx.translate(x, y - 480);
  const player = new ParticleCanvasPlayer(system as ParticleSystem, facade, {
    seed,
    clear: false,
    pixelRadius: 6,
    composite: ["gas-seep", "impact-dust", "drill-debris"].includes(name)
      ? "source-over"
      : "lighter",
  });
  ready = true;
  // Replay the produced simulation to its authoritative age, never advance game
  // state in render. Re-rendering the same state produces precisely the same FX.
  player.update(Math.max(0.001, age));
  ctx.restore();
}
function world(s: ReadState, ctx: Context) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const shake = s.shake;
  ctx.translate(
    -s.camera.x + Math.sin(s.elapsedSeconds * 91) * shake,
    -s.camera.y + C.HUD_H + Math.cos(s.elapsedSeconds * 73) * shake * 0.7,
  );
  ctx.fillStyle = P.ink;
  ctx.fillRect(s.camera.x, s.camera.y, C.VIEW_W, C.VIEW_H);
  if (s.camera.y < C.SURFACE_Y) {
    image(
      s,
      ctx,
      "surface/sky.png",
      s.camera.x,
      s.camera.y,
      1280,
      Math.max(480, C.SURFACE_Y - s.camera.y),
    );
    for (const b of buildings) {
      image(s, ctx, "surface/" + b.id + ".png", b.x, b.y, b.w, b.h);
      text(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + b.w / 2 - 72,
        b.y - 14,
        12,
        P.muted,
      );
    }
    const pad = buildings[5];
    image(
      s,
      ctx,
      `rocket/stage${s.installed}.png`,
      pad.x + 80,
      C.SURFACE_Y - 222 - (s.launchTime ?? 0) ** 2 * 90,
      148,
      222,
    );
    text(
      ctx,
      "↓  CAVE ACCESS",
      C.CAVE_MOUTH_COL * C.TILE - 30,
      C.SURFACE_Y - 45,
      13,
      P.amber,
    );
  }
  const minRow = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    maxRow = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  for (let r = minRow; r <= maxRow; r++)
    for (
      let c = Math.max(0, Math.floor(s.camera.x / C.TILE));
      c <=
      Math.min(C.WORLD_COLS - 1, Math.floor((s.camera.x + C.VIEW_W) / C.TILE));
      c++
    ) {
      const t = tile(s, c, r),
        x = c * C.TILE,
        y = r * C.TILE;
      const b = t.band ?? "coreshell";
      image(
        s,
        ctx,
        `tiles/${b}-${Math.abs(c * 7 + r * 13) % C.TILE_VARIANTS}.png`,
        x,
        y,
        C.TILE,
        C.TILE,
      );
      if (t.kind === "bedrock")
        image(s, ctx, "tiles/bedrock.png", x, y, C.TILE, C.TILE);
      else if (t.kind === "tunnel" || t.kind === "lava")
        passage(s, ctx, c, r, t.kind);
      else if (t.kind === "stone")
        image(s, ctx, `tiles/stone-${(c + r) % 2}.png`, x, y, C.TILE, C.TILE);
      else if (t.kind === "ore")
        image(s, ctx, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
      else if (t.kind === "material")
        image(s, ctx, `materials/${t.material}.png`, x, y, C.TILE, C.TILE);
      else if (t.kind === "core")
        image(s, ctx, "materials/core.png", x, y, C.TILE, C.TILE);
      if (t.health !== null && t.maxHealth && t.health < t.maxHealth)
        image(
          s,
          ctx,
          `tiles/crack/frame0${Math.min(C.CRACK_FRAMES - 1, Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES))}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
      ctx.strokeStyle = "#00000018";
      ctx.strokeRect(x + 0.5, y + 0.5, C.TILE - 1, C.TILE - 1);
      if (r === 1) {
        image(s, ctx, "surface/ground.png", x, C.SURFACE_Y, C.TILE, 12);
        if (c === C.CAVE_MOUTH_COL)
          image(s, ctx, "surface/cave-mouth.png", x, y, C.TILE, C.TILE);
      }
    }
  if (s.launchTime === null) {
    const m = s.miner;
    const count =
      Object.keys(s.assets.images).filter((k) =>
        k.startsWith("miner/" + m.state + "/"),
      ).length || 2;
    const f =
      m.state === "hurt"
        ? Math.min(count - 1, Math.floor(s.animationTime * C.ANIM_FPS))
        : Math.floor(s.animationTime * C.ANIM_FPS) % count;
    ctx.save();
    ctx.translate(m.x + C.MINER_W / 2, m.y - 6);
    if (m.facing === "west") ctx.scale(-1, 1);
    image(
      s,
      ctx,
      `miner/${m.state}/frame${String(f).padStart(2, "0")}.png`,
      -C.MINER_SPRITE / 2,
      0,
      C.MINER_SPRITE,
      C.MINER_SPRITE,
    );
    ctx.restore();
  }
  for (const e of s.effects)
    particles(s, ctx, e.name, e.x, e.y, e.age, e.seed, e.tint);
  if (s.coreGround) {
    const p = s.coreGround;
    image(
      s,
      ctx,
      "materials/core-sample.png",
      p.col * C.TILE,
      p.row * C.TILE,
      C.TILE,
      C.TILE,
    );
    text(
      ctx,
      `${Math.ceil(s.coreTimer ?? 0)}s`,
      p.col * C.TILE,
      p.row * C.TILE - 10,
      22,
      P.red,
    );
  }
  const b = buildingAt(s);
  if (b && !s.panel) {
    box(ctx, { x: b.x + 16, y: C.SURFACE_Y + 26, w: 208, h: 32 });
    text(
      ctx,
      `E • ${b.id === "save-pad" ? "SAVE" : "OPEN TERMINAL"}`,
      b.x + 30,
      C.SURFACE_Y + 47,
      13,
      P.amber,
    );
  }
  ctx.restore();
  // Gentle peripheral darkness preserves both character and mineral readability.
  const vignette = ctx.createRadialGradient(640, 385, 200, 640, 385, 760);
  vignette.addColorStop(0, "#07121a00");
  vignette.addColorStop(1, "#07121a88");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
}
function gauge(
  s: ReadState,
  ctx: Context,
  name: string,
  label: string,
  value: number,
  max: number,
  x: number,
  color: string,
) {
  image(s, ctx, `icons/${name}.png`, x, 16, 24, 24);
  text(ctx, label, x + 34, 21, 10, P.muted);
  text(ctx, `${Math.ceil(value)}/${max}`, x + 34, 38, 14, color);
  ctx.fillStyle = "#263d48";
  ctx.fillRect(x + 105, 19, 84, 15);
  ctx.fillStyle = color;
  ctx.fillRect(x + 105, 19, 84 * Math.max(0, Math.min(1, value / max)), 15);
}
function hud(s: ReadState, ctx: Context) {
  ctx.fillStyle = "#0c1d28";
  ctx.fillRect(0, 0, C.STAGE_W, C.HUD_H);
  ctx.fillStyle = "#3e5661";
  ctx.fillRect(0, C.HUD_H - 1, C.STAGE_W, 1);
  gauge(
    s,
    ctx,
    "fuel",
    "FUEL",
    s.miner.fuel,
    maxFuel(s),
    20,
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION ? P.red : P.amber,
  );
  gauge(
    s,
    ctx,
    "hull",
    "HULL",
    s.miner.hull,
    maxHull(s),
    230,
    s.miner.hull < maxHull(s) * C.LOW_HULL_FRACTION ? P.red : P.cyan,
  );
  image(s, ctx, "icons/cargo.png", 440, 16, 24, 24);
  text(
    ctx,
    `${slots(s)}/${slotCap(s)} • ${loadKg(s)}kg`,
    474,
    24,
    14,
    slots(s) >= slotCap(s) ? P.red : P.text,
  );
  text(
    ctx,
    loadKg(s) >= jetpack(s).liftLimitKg
      ? C.OVERLOAD
      : `LIFT ${jetpack(s).liftLimitKg}kg`,
    474,
    41,
    10,
    loadKg(s) >= jetpack(s).liftLimitKg ? P.red : P.muted,
  );
  image(s, ctx, "icons/credits.png", 650, 16, 24, 24);
  text(
    ctx,
    `${Math.floor(s.credits).toLocaleString()} Cr`,
    684,
    34,
    17,
    P.amber,
  );
  image(s, ctx, "icons/depth.png", 805, 16, 24, 24);
  text(ctx, `${Math.floor(depth(s))} m`, 840, 34, 17);
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] ? 1 : 0.25;
    image(s, ctx, `icons/${m}.png`, 934 + i * 32, 16, 24, 24);
    ctx.globalAlpha = 1;
  }
  for (const c of controls(s).filter((c) =>
    ["inventory", "pause", "mute"].includes(c.id),
  ))
    button(ctx, c.label, "", c.rect, false);
}
function overlays(s: ReadState, ctx: Context) {
  const scan = scanner(s);
  if (scan.locked && !s.panel) {
    box(ctx, { x: 30, y: 82, w: 290, h: 64 });
    text(ctx, `SCANNER  /  ${scan.target?.toUpperCase()}`, 46, 105, 12, P.cyan);
    ctx.save();
    ctx.translate(61, 127);
    ctx.rotate(Math.atan2(scan.dirY, scan.dirX));
    ctx.strokeStyle = P.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.moveTo(5, -6);
    ctx.lineTo(12, 0);
    ctx.lineTo(5, 6);
    ctx.stroke();
    ctx.restore();
    text(ctx, `${scan.distanceTiles?.toFixed(1)} TILES`, 88, 133, 17);
  }
  if (s.satchel.coreSample) {
    box(ctx, { x: 445, y: 78, w: 390, h: 76 }, "#38262cee", P.red);
    text(
      ctx,
      `CORE DESTABILIZATION  ${Math.ceil(s.coreTimer ?? 0)}s`,
      463,
      107,
      20,
      P.red,
    );
    text(ctx, "J  JETTISON  •  Reach the Launch Pad", 463, 135, 12, P.text);
  }
  if (s.panel) {
    ctx.fillStyle = "#05111bc4";
    ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
    const r = { x: 200, y: 104, w: 880, h: 572 };
    box(ctx, r);
    ctx.fillStyle = P.amber;
    ctx.fillRect(r.x, r.y, 4, 62);
    text(
      ctx,
      s.panel.replace(/-/g, " ").toUpperCase(),
      230,
      144,
      27,
      P.text,
      "sans-serif",
    );
    text(ctx, panelSubtitle(s), 230, 174, 12, P.muted);
    const list = controls(s).filter(
      (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
    );
    for (const [i, c] of list.entries())
      button(
        ctx,
        c.label,
        c.detail,
        c.rect,
        i === s.panelIndex,
        c.enabled,
        C.ITEM_IDS.findIndex((id) => id === c.subject),
      );
    if (s.panel === "ore-market") {
      let y = 300;
      for (const m of C.MINERALS)
        if (s.cargo[m.id]) {
          image(s, ctx, `ore/${m.id}.png`, 310, y - 20, 30, 30);
          text(
            ctx,
            `${m.name} ×${s.cargo[m.id]}   ${m.value * (s.cargo[m.id] ?? 0)} Cr`,
            355,
            y,
            15,
          );
          y += 24;
        }
    }
    if (s.panel === "launch-pad") {
      for (const [i, p] of C.ROCKET_COMPONENTS.entries()) {
        text(
          ctx,
          `${i < s.installed ? "✓" : "○"}   ${p.name}`,
          315,
          320 + i * 46,
          19,
          i < s.installed ? P.cyan : P.muted,
        );
        text(
          ctx,
          `${p.credits} Cr${p.material ? " + " + p.material : ""}`,
          620,
          320 + i * 46,
          14,
          P.muted,
        );
      }
      image(s, ctx, `rocket/stage${s.installed}.png`, 850, 344, 112, 168);
    }
  }
  if (s.notice?.shown) {
    box(ctx, { x: 310, y: 570, w: 660, h: 110 }, "#283b43f5", P.amber);
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "VOLATILE GAS  /  Watch the rock breathe."
        : "MOLTEN ROCK  /  Heat eats through the suit.",
      334,
      602,
      18,
      P.amber,
    );
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "Gas ignores radiators. Upgrade your hull before going deeper."
        : "Route around pools, or fit a radiator to reduce the burn.",
      334,
      632,
      14,
    );
    text(
      ctx,
      "Click to dismiss • the mine is still running",
      334,
      657,
      11,
      P.muted,
    );
  }
  if (s.noteTime > 0) {
    box(ctx, { x: 360, y: 662, w: 560, h: 34 }, "#112732ec");
    ctx.textAlign = "center";
    text(ctx, s.note, 640, 684, 13, P.amber);
    ctx.textAlign = "left";
  }
  if (!s.panel && !s.notice?.shown) {
    text(
      ctx,
      "A D  MOVE   S  DRILL   W / SPACE  THRUST   E  TERMINAL   I  CARGO",
      26,
      697,
      12,
      P.muted,
    );
    const band =
      C.BANDS[
        Math.min(
          3,
          Math.floor(
            (Math.max(0, depth(s)) / (s.coreRow * C.METERS_PER_ROW)) * 4,
          ),
        )
      ];
    ctx.textAlign = "right";
    text(
      ctx,
      `${band.toUpperCase()}  /  ${s.worldSize.toUpperCase()}`,
      1250,
      697,
      12,
      P.muted,
    );
    ctx.textAlign = "left";
  }
}
function menus(s: ReadState, ctx: Context) {
  const title = s.screen === "title";
  ctx.fillStyle = title ? "#07172255" : "#071722db";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (title) {
    const grad = ctx.createLinearGradient(0, 0, 1100, 0);
    grad.addColorStop(0, "#091c29ff");
    grad.addColorStop(0.5, "#091c29ee");
    grad.addColorStop(1, "#091c2933");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    text(
      ctx,
      "D E A D  W O R L D .  L I V E  C A R G O .",
      100,
      125,
      13,
      P.amber,
    );
    text(ctx, C.TITLE_TEXT, 94, 225, 91, P.text, "sans-serif");
    ctx.fillStyle = P.amber;
    ctx.fillRect(100, 250, 74, 4);
    text(
      ctx,
      "Depth is cheap. Height is expensive.",
      100,
      290,
      20,
      P.muted,
      "sans-serif",
    );
    image(s, ctx, "miner/drill-side/frame00.png", 815, 285, 240, 240);
    text(ctx, "ONE PROSPECTOR. ONE WAY OUT.", 806, 568, 13, P.amber);
    text(ctx, "DIG  /  HAUL  /  FABRICATE  /  ESCAPE", 806, 592, 12, P.muted);
    text(ctx, "↓  A subterranean expedition", 100, 640, 13, P.muted);
    text(ctx, "ENTER TO SELECT   •   ↑ ↓ TO NAVIGATE", 100, 675, 11, P.muted);
  } else {
    const heading =
      s.screen === "mode-select"
        ? "CHOOSE YOUR STAKES"
        : s.screen === "size-select"
          ? "HOW FAR DOWN?"
          : s.screen === "how-to-play"
            ? "THE WAY OUT IS DOWN"
            : s.screen === "paused"
              ? "EXPEDITION PAUSED"
              : s.screen === "victory"
                ? "YOU MADE IT OFF WORLD"
                : "SIGNAL LOST";
    text(ctx, "D E E P C O R E  /  EXPEDITION CONTROL", 120, 132, 13, P.amber);
    text(ctx, heading, 116, 212, 48, P.text, "sans-serif");
    if (s.screen === "mode-select") {
      text(
        ctx,
        "STANDARD  •  Restore your last Save Pad checkpoint after death.",
        120,
        264,
        17,
        P.muted,
      );
      text(
        ctx,
        "HARDCORE  •  Death deletes the save. Every descent is final.",
        120,
        292,
        17,
        P.red,
      );
    }
    if (s.screen === "size-select")
      text(
        ctx,
        "Same mineral riches. Same risks. Choose the length of the climb.",
        120,
        271,
        17,
        P.muted,
      );
    if (s.screen === "how-to-play") {
      const lines = [
        "Build five rocket components at the Launch Pad, then leave this rock.",
        "A / D or ← / →  Walk.  S / ↓  Drill down.  W / ↑ / SPACE  Jetpack.",
        "Drill left, right, and down — never up. Fly back through your tunnels.",
        "Bring ore to the Market. Buy fuel, repair, upgrade, and descend again.",
        "Slots limit cargo. Weight limits lift. I opens cargo; drop ore if overloaded.",
        "Watch for gas seeps, lava, and hard landings. Thrust before impact.",
        "Buy a scanner to find Resonite and Cryenite. The Core lies at the bottom.",
        "The Core Sample lasts 90 seconds. Fabricate Ignition before it explodes.",
        "E opens buildings; Save Pad writes one local save. 1–6 use field supplies.",
        "Standard keeps your save after death. Hardcore deletes it. M mutes.",
      ];
      lines.forEach((line, i) =>
        text(ctx, line, 120, 270 + i * 30, 16, i % 2 ? P.muted : P.text),
      );
    }
    if (s.summary) {
      const z = s.summary;
      text(
        ctx,
        `${z.mode.toUpperCase()}  /  ${s.worldSize.toUpperCase()}${z.deathCause ? "  /  " + z.deathCause.toUpperCase() : ""}`,
        120,
        266,
        16,
        z.deathCause ? P.red : P.cyan,
      );
      const rows = [
        ["DEEPEST POINT", `${Math.floor(z.deepestDepthMeters)} m`],
        ["CREDITS EARNED", `${z.creditsEarned} Cr`],
        [
          "TIME UNDERGROUND",
          `${Math.floor(z.elapsedSeconds / 60)}m ${Math.floor(z.elapsedSeconds % 60)}s`,
        ],
        ["ROCKET COMPONENTS", `${z.componentsInstalled} / 5`],
      ];
      for (const [i, [label, value]] of rows.entries()) {
        text(ctx, label, 760, 340 + i * 64, 12, P.muted);
        text(ctx, value, 760, 368 + i * 64, 25, P.text, "sans-serif");
      }
    }
  }
  for (const [i, item] of menuItems(s).entries()) {
    const r = menuRect(s, i);
    if (r)
      button(
        ctx,
        item,
        s.screen === "size-select" && i < C.WORLD_SIZES.length
          ? `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[C.WORLD_SIZES[i]]) * C.METERS_PER_ROW} m TO CORE`
          : "",
        r,
        s.menuIndex === i,
      );
  }
  text(ctx, "01 / STRANDED PROSPECTOR PROGRAM", 100, 48, 11, P.muted);
  ctx.textAlign = "right";
  text(ctx, "NO RESCUE INBOUND", 1180, 675, 11, P.muted);
  ctx.textAlign = "left";
}
export function render(s: ReadState, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  world(s, ctx);
  if (s.screen === "in-mine") {
    hud(s, ctx);
    overlays(s, ctx);
  } else if (
    s.screen === "victory" &&
    s.launchTime !== null &&
    s.launchTime < 3
  ) {
    hud(s, ctx);
    ctx.textAlign = "center";
    text(ctx, "ASCENT CONFIRMED", 640, 130, 27, P.amber, "sans-serif");
    text(ctx, "You are leaving the dead world behind.", 640, 164, 15, P.text);
    ctx.textAlign = "left";
  } else {
    if (s.screen === "paused") hud(s, ctx);
    menus(s, ctx);
  }
}
