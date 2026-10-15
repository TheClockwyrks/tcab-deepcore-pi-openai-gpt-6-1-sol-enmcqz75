import * as C from "./constants";
import {
  type Rect,
  type ReadState,
  type DeepcoreState as State,
  buildings,
  loadKg,
  slots,
  slotCap,
  maxFuel,
  maxHull,
  jetpack,
} from "./model";
import * as R from "./rules";
export interface Control {
  id: string;
  subject: string | null;
  label: string;
  detail: string;
  rect: Rect;
  enabled: boolean;
}
export function menuItems(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  return {
    x: s.screen === "title" ? 100 : 120,
    y: s.screen === "how-to-play" ? 610 : 330 + index * 66,
    w: s.screen === "title" ? 390 : 480,
    h: 54,
  };
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const list: Control[] = [];
  const add = (
    id: string,
    label: string,
    detail: string,
    subject: string | null = null,
    enabled = true,
  ) =>
    list.push({
      id,
      label,
      detail,
      subject,
      enabled,
      rect: { x: 300, y: 210 + list.length * 48, w: 680, h: 40 },
    });
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        `CHARGE +${C.FUEL_BUY_INCREMENT}`,
        `${C.FUEL_PRICE} Cr / unit`,
        null,
        s.credits >=
          Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
            C.FUEL_PRICE && s.miner.fuel < maxFuel(s),
      );
      add(
        "fill-fuel",
        "FILL TANK",
        `${Math.max(0, maxFuel(s) - s.miner.fuel).toFixed(0)} units missing`,
        null,
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "buy-repair",
        `REPAIR +${C.REPAIR_BUY_INCREMENT}`,
        `${C.REPAIR_PRICE} Cr / point`,
        null,
        s.credits >=
          Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
            C.REPAIR_PRICE && s.miner.hull < maxHull(s),
      );
      add(
        "repair-full",
        "REPAIR TO FULL",
        `${Math.max(0, maxHull(s) - s.miner.hull).toFixed(0)} points missing`,
        null,
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      break;
    case "ore-market":
      add(
        "sell",
        C.SELL,
        `${C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.value, 0)} Cr • ${slots(s)} units`,
        null,
        slots(s) > 0,
      );
      break;
    case "upgrade-shop":
      for (const t of C.TRACKS) {
        const level = s.tiers[t],
          price = C.UPGRADE_PRICES[level - 1];
        const value =
          t === "fuel"
            ? `${C.FUEL_TIERS[level]} fuel`
            : t === "hull"
              ? `${C.HULL_TIERS[level]} hull`
              : t === "cargo"
                ? `${C.CARGO_TIERS[level]} slots`
                : t === "jetpack"
                  ? `${C.JETPACK_TIERS[level]?.liftLimitKg} kg lift`
                  : t === "radiator"
                    ? `${C.RADIATOR_TIERS[level] * 100}% heat protection`
                    : t === "scanner"
                      ? `${C.SCANNER_TIERS[level]} tile range`
                      : `power ${level + 1}`;
        add(
          "buy-upgrade",
          `${t.toUpperCase()}  ${level}/${C.MAX_TIER[t]}`,
          level === C.MAX_TIER[t] ? "MAXIMUM" : `${value} • ${price} Cr`,
          t,
          level < C.MAX_TIER[t] && s.credits >= price,
        );
      }
      break;
    case "supply-depot":
      for (const [i, item] of C.ITEMS.entries())
        add(
          "buy-item",
          `${i + 1}  ${item.name}`,
          `${item.price} Cr • held ${s.items[item.id]}`,
          item.id,
          s.credits >= item.price,
        );
      break;
    case "launch-pad": {
      const p = C.ROCKET_COMPONENTS[s.installed];
      const met =
        !p?.material ||
        (p.material === "core-sample"
          ? s.satchel.coreSample
          : s.satchel[p.material] > 0);
      if (p)
        add(
          "fabricate",
          C.FABRICATE,
          `${p.name} • ${p.credits} Cr${p.material ? " + " + p.material + (met ? " ✓" : " MISSING") : ""}`,
          null,
          R.canFabricate(s),
        );
      else
        add(
          "launch",
          C.LAUNCH,
          "All systems ready. Leave this world.",
          null,
          true,
        );
      break;
    }
    case "inventory":
      for (const m of C.MINERALS)
        if (s.cargo[m.id])
          add(
            "drop-ore",
            `${m.name} ×${s.cargo[m.id]}`,
            `${m.weightKg * (s.cargo[m.id] ?? 0)} kg • DROP ONE`,
            m.id,
          );
      for (const [i, item] of C.ITEMS.entries())
        if (s.items[item.id])
          add(
            "use-item",
            `${i + 1}  ${item.name} ×${s.items[item.id]}`,
            C.USE,
            item.id,
          );
      if (s.satchel.coreSample)
        add("jettison", C.JETTISON, "Drop the unstable Core Sample");
      // Dense inventories remain fully on-screen with compact two-column rows.
      for (const [i, c] of list.entries())
        c.rect = {
          x: 230 + Math.floor(i / 11) * 420,
          y: 185 + (i % 11) * 39,
          w: 400,
          h: 34,
        };
      break;
  }
  const hud: Control[] = [
    {
      id: "inventory",
      subject: null,
      label: "I  CARGO",
      detail: "",
      rect: { x: 1024, y: 10, w: 100, h: 36 },
      enabled: true,
    },
    {
      id: "pause",
      subject: null,
      label: "Ⅱ",
      detail: "",
      rect: { x: 1134, y: 10, w: 48, h: 36 },
      enabled: true,
    },
    {
      id: "mute",
      subject: null,
      label: s.muted ? "♪ OFF" : "♪",
      detail: "",
      rect: { x: 1192, y: 10, w: 68, h: 36 },
      enabled: true,
    },
  ];
  if (s.panel)
    list.push({
      id: "close-panel",
      subject: null,
      label: "× CLOSE",
      detail: "",
      rect: { x: 936, y: 119, w: 120, h: 36 },
      enabled: true,
    });
  list.push(...hud);
  if (s.notice?.shown)
    list.push({
      id: "dismiss-notice",
      subject: null,
      label: "",
      detail: "",
      rect: { x: 310, y: 570, w: 660, h: 110 },
      enabled: true,
    });
  return list;
}
export function controlRect(
  s: ReadState,
  id: string,
  subject: string | null,
): Rect | null {
  return (
    controls(s).find((c) => c.id === id && c.subject === subject)?.rect ?? null
  );
}
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function choose(s: State): State {
  const choice = menuItems(s)[s.menuIndex];
  const screen = (name: C.ScreenName, index = 0) => {
    s.screen = name;
    s.menuIndex = index;
  };
  switch (s.screen) {
    case "title":
      if (choice === "CONTINUE") return R.restore(s);
      screen(choice === "HOW TO PLAY" ? "how-to-play" : "mode-select");
      break;
    case "mode-select":
      if (choice === "BACK") screen("title", s.hasSave ? 1 : 0);
      else {
        s.mode = C.MODES[s.menuIndex];
        screen("size-select");
      }
      break;
    case "size-select":
      if (choice === "BACK") screen("mode-select", C.MODES.indexOf(s.mode));
      else {
        s.worldSize = C.WORLD_SIZES[s.menuIndex];
        return R.start(s);
      }
      break;
    case "how-to-play":
      screen("title", s.hasSave ? 2 : 1);
      break;
    case "paused":
      if (choice === "RESUME") screen("in-mine");
      else if (choice === "RESTART") return R.start(s);
      else screen("title", s.hasSave ? 1 : 0);
      break;
    case "game-over":
    case "victory":
      if (choice === "MENU") screen("title", s.hasSave ? 1 : 0);
      else if (choice === "CONTINUE FROM SAVE") return R.restore(s);
      else return R.start(s);
      break;
  }
  return s;
}
export function back(s: State): State {
  switch (s.screen) {
    case "in-mine":
      if (s.panel) s.panel = null;
      else {
        s.screen = "paused";
        s.menuIndex = 0;
      }
      break;
    case "paused":
      s.screen = "in-mine";
      s.menuIndex = 0;
      break;
    case "mode-select":
      s.screen = "title";
      s.menuIndex = s.hasSave ? 1 : 0;
      break;
    case "size-select":
      s.screen = "mode-select";
      s.menuIndex = C.MODES.indexOf(s.mode);
      break;
    case "how-to-play":
      s.screen = "title";
      s.menuIndex = s.hasSave ? 2 : 1;
      break;
  }
  return s;
}
export function activateBuilding(s: State, id: C.BuildingId): void {
  if (id === "save-pad") R.save(s);
  else {
    s.panel = id;
    s.panelIndex = 0;
  }
}
export function act(s: State, id: string, subject: string | null): State {
  switch (id) {
    case "close-panel":
      s.panel = null;
      break;
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
      break;
    case "pause":
      return back(s);
    case "mute":
      s.muted = !s.muted;
      break;
    case "drop-ore":
      if (subject) {
        const ore = subject as C.OreId;
        if ((s.cargo[ore] ?? 0) > 0) s.cargo[ore] = (s.cargo[ore] ?? 0) - 1;
      }
      break;
    case "use-item":
      R.useItem(s, subject as C.ItemId);
      break;
    case "buy-item":
      R.buyItem(s, subject as C.ItemId);
      break;
    case "buy-upgrade":
      R.buyUpgrade(s, subject as C.TrackName);
      break;
    case "buy-fuel":
      R.refill(s, false, false);
      break;
    case "fill-fuel":
      R.refill(s, false, true);
      break;
    case "buy-repair":
      R.refill(s, true, false);
      break;
    case "repair-full":
      R.refill(s, true, true);
      break;
    case "sell":
      R.sell(s);
      break;
    case "fabricate":
      R.fabricate(s);
      break;
    case "launch":
      R.launch(s);
      break;
    case "jettison":
      R.jettison(s);
      break;
    case "dismiss-notice":
      s.notice = null;
      break;
  }
  return s;
}
export function panelSubtitle(s: ReadState): string {
  if (s.panel === "inventory")
    return `${slots(s)}/${slotCap(s)} SLOTS  •  ${loadKg(s)} KG${loadKg(s) >= jetpack(s).liftLimitKg ? " • " + C.OVERLOAD : ""}   |   RESONITE ${s.satchel.resonite}   CRYENITE ${s.satchel.cryenite}`;
  return s.panel === "fuel-depot"
    ? "Fuel and repairs are never free. Budget for the climb home."
    : s.panel === "ore-market"
      ? "The only way to earn is to bring it back alive."
      : s.panel === "upgrade-shop"
        ? "Better equipment. Deeper bets."
        : s.panel === "supply-depot"
          ? "Single-use supplies • deploy with keys 1–6"
          : s.panel === "launch-pad"
            ? `${s.installed}/5 COMPONENTS INSTALLED • your ticket off this rock`
            : "";
}
export function buildingAt(s: ReadState) {
  return buildings.find(
    (b) =>
      s.miner.y + C.MINER_H <= C.SURFACE_Y + 1 &&
      s.miner.y + C.MINER_H >= C.SURFACE_Y - 40 &&
      s.miner.x + C.MINER_W / 2 >= b.x &&
      s.miner.x + C.MINER_W / 2 <= b.x + b.w,
  );
}
