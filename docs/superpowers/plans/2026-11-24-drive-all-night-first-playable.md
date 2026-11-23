# Drive All Night — First Playable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first playable of Drive All Night: a top-down synthwave browser game where you chase the sunset collecting Particle X, dock with a moving city to trade, upgrade and save, fight pirates in turn-based battles, call for rescue when broken down, and win by buying the largest hull.

**Architecture:** All game rules live in pure TypeScript modules under `src/sim/` and `src/config/`, which take plain data in and return new plain data out, and are unit-tested with Vitest. Phaser scenes under `src/scenes/` stay thin: they read input, call the sim functions, and draw. Every sprite is painted procedurally onto canvases at boot (`src/art/`), porting the approved mockup's drawing style.

**Tech Stack:** Node.js LTS, Vite 5, TypeScript 5 (strict), Phaser 3.80, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-11-23-drive-all-night-design.md` (read it before starting). Approved look: `mockups/synthwave-driving-v2.html`. Its `bevel`, `wheel`, `tread`, `circle` and pixel-font code is the reference to port.

## Global Constraints

- Runs in a modern desktop browser as static files; `npm run build` outputs `dist/`, which works when opened from any sub-path (`base: './'`).
- Phaser 3 + TypeScript (strict) + Vite. No other runtime dependencies.
- Pixel art: internal resolution **480×270**, `pixelArt: true`, `roundPixels: true`, scaled by **whole-number zoom** only.
- Synthwave palette and heavy, solid machines with neon accents only (spec "Art direction"); vehicles are original designs.
- Keyboard controls only (desktop). No touch, gamepad, multiplayer or music in this plan.
- One save slot in `localStorage`, key `drive-all-night/save-v1`; saving happens only in the city (plus autosave on dock and at new game).
- The world clock stops during battles and city menus.
- Every tunable number lives in `src/config/balance.ts` (and the catalog in `src/config/catalog.ts`); no magic numbers in scenes or sim.

## Review Focus

1. **Crossing the world's wrap seam** (driving past y = 0 / `WORLD_LEN`): terrain, Particle X, the city and the sun must continue seamlessly, with no jump. Pinned by seam tests in Tasks 2 and 3.
2. **A corrupt, outdated or missing save, or blocked storage**: the title screen offers only New Game and nothing throws. Pinned by save tests in Task 5.
3. **Tab hidden then shown again**: Phaser hands over a huge frame delta, and the sun must not leap ahead and destroy the player. Pinned by the clock clamp test in Task 2.
4. **Debt larger than a sale, or buying without enough credits**: credits never go negative, and sale proceeds pay debt first. Pinned by economy tests in Task 5.
5. **Fleeing or winning, then touching the same pirates again**: the player must not be trapped in a battle loop. Pinned by the `graceSeconds` test in Task 6, and wired up in Task 10.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
src/main.ts                    Phaser game config, integer zoom, scene list
src/config/balance.ts          BALANCE constants (all tunables)
src/config/catalog.ts          HULLS, PARTS, REPAIR_KIT
src/sim/rng.ts                 seeded RNG + coordinate hash
src/sim/world.ts               wrap, sun lines, zones, dawn timing, city position
src/sim/clock.ts               world-time advance, planet-time label
src/sim/terrain.ts             procedural terrain
src/sim/particles.ts           Particle X density, depletion, collection
src/sim/vehicle.ts             vehicle state, derived stats, fuel/cargo
src/sim/game-state.ts          GameState, newGame
src/sim/economy.ts             city transactions
src/sim/save.ts                serialize / localStorage
src/sim/pirates.ts             spawn odds, pirate generation, grace timer
src/sim/battle.ts              turn-based battle rules
src/sim/rescue.ts              distress-call outcomes
src/game/session.ts            the one live GameState + DepletionMap shared by scenes
src/art/palette.ts, font.ts, painters.ts   procedural pixel art
src/scenes/BootScene.ts, TitleScene.ts, DriveScene.ts, HudScene.ts,
           CityScene.ts, BattleScene.ts, VictoryScene.ts, GalleryScene.ts
src/scenes/drive/ground.ts, particles-layer.ts, lighting.ts, pirates-map.ts, rescue-flow.ts
tests/*.test.ts                one test file per sim module
.github/workflows/pages.yml
```

**World orientation (decided here):** the world wraps along **y** (length `WORLD_LEN`) and is bounded across **x** (`WORLD_WIDTH`). The sun travels toward **−y**, so the sunset is "up" on screen as in the mockup. Scenes keep the player's y continuous (unbounded); every sim function wraps internally. Use `nearestCopy` to place wrapped things (the city, the sun lines) next to the player.

---

### Task 1: Project scaffold, RNG and balance constants

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/config/balance.ts`, `src/sim/rng.ts`, `src/scenes/BootScene.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number` (values in [0, 1))
  - `makeRng(seed: number): Rng` (mulberry32)
  - `hash2(seed: number, x: number, y: number): number` (deterministic, in [0, 1), integer inputs)
  - `randomSeed(): number` (uint32 from `crypto.getRandomValues`)
  - `BALANCE` (`as const` object) with these values:
    `WORLD_LEN 172800, WORLD_WIDTH 4096, EDGE 64, SUN_SPEED 36, SUN_START_Y 0, SUNSET_ZONE_FRAC 0.15, PREDAWN_FRAC 0.8, PLANET_SECONDS_PER_SECOND 252, CITY_BEHIND_FRAC 0.12, CELL 8, DENSITY_MAX 0.45, DECAY_FRAC 0.35, X_PER_CELL 0.1, X_SELL_PRICE 5, X_BUY_PRICE 7, REPAIR_COST_PER_HP 2, FUEL_PER_SECOND 0.25, HEAT_BASE_DPS 4, HEAT_RAMP 200, DOCK_RADIUS 40, CONTACT_RADIUS 12, GRACE_SECONDS 4, RESCUE_FUEL 15`
    (and `NIGHT_LEN = WORLD_LEN / 2` as a derived export `NIGHT_LEN`).

- [ ] **Step 1: Install Node.js LTS.** Run `node --version`. If it's missing, ask the user to approve `winget install OpenJS.NodeJS.LTS`, then reopen the shell. Expected: `v20.x` or newer.
- [ ] **Step 2: Scaffold.** Write `package.json` with scripts `dev: vite`, `build: tsc --noEmit && vite build`, `typecheck: tsc --noEmit`, `test: vitest run`; deps `phaser@^3.80`; devDeps `typescript@^5`, `vite@^5`, `vitest@^2`. `tsconfig` strict, `target ES2022`, `moduleResolution bundler`. `vite.config.ts` uses `base: './'`. `.gitignore` covers `node_modules`, `dist`. Run `npm install`.
- [ ] **Step 3: Write the failing test** `tests/rng.test.ts`:

```ts
test('makeRng is deterministic per seed', () => {
  const a = makeRng(42), b = makeRng(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  expect(makeRng(43)()).not.toBe(makeRng(42)());
});
test('rng and hash2 stay in [0,1)', () => {
  const r = makeRng(1);
  for (let i = 0; i < 1000; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  for (let i = 0; i < 1000; i++) { const h = hash2(7, i, -i * 3); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); }
});
test('hash2 is deterministic and seed-sensitive', () => {
  expect(hash2(5, 10, 20)).toBe(hash2(5, 10, 20));
  expect(hash2(5, 10, 20)).not.toBe(hash2(6, 10, 20));
});
```

- [ ] **Step 4: Run** `npm test` and check it fails because `rng.ts` is missing.
- [ ] **Step 5: Implement** `src/sim/rng.ts` and `src/config/balance.ts`.
- [ ] **Step 6: Boot the game.** `src/main.ts` creates `Phaser.Game` with width 480, height 270, `pixelArt: true`, `roundPixels: true`, `backgroundColor '#07020f'`, `scale.mode NONE`, and on window resize sets `zoom = max(1, floor(min(innerWidth/480, innerHeight/270)))` via `game.scale.setZoom`. The canvas is centred with CSS. `BootScene` (key `'boot'`) draws the text "DRIVE ALL NIGHT" for now.
- [ ] **Step 7: Verify.** `npm test` passes, and so does `npm run build`. Run `npm run dev` and open the URL in the browser pane: the text shows up crisp (not blurry), and resizing the window changes the zoom in whole steps.
- [ ] **Step 8: Commit** `feat: scaffold Phaser + TypeScript + Vite project with seeded RNG`

---

### Task 2: World geometry and clock

**Files:**
- Create: `src/sim/world.ts`, `src/sim/clock.ts`
- Test: `tests/world.test.ts`, `tests/clock.test.ts`

**Interfaces:**
- Consumes: `BALANCE`, `NIGHT_LEN`
- Produces (`t` is world seconds, meaning unpaused play time):
  - `type Zone = 'sunset' | 'deep' | 'predawn' | 'scorch' | 'dawn'`
  - `wrapAlong(y: number): number` → [0, WORLD_LEN)
  - `sunsetY(t: number): number` = `wrapAlong(SUN_START_Y − SUN_SPEED·t)`
  - `behindSunset(y: number, t: number): number` = `wrapAlong(y − sunsetY(t))`
  - `zoneAt(y: number, t: number): Zone`. With `b = behindSunset`: if `b < NIGHT_LEN`, return `sunset` (b < 0.15·NIGHT_LEN), `deep` (b < 0.8·NIGHT_LEN) or `predawn`. Otherwise it's day: `aheadDepth = WORLD_LEN − b`, `dawnDepth = b − NIGHT_LEN`, return `scorch` if `aheadDepth < dawnDepth`, else `dawn`.
  - `scorchDepth(y, t): number` = `aheadDepth` when the zone is `scorch`, else 0
  - `heatDps(y, t): number` = `HEAT_BASE_DPS · (1 + scorchDepth/HEAT_RAMP)²` when the zone is `scorch`, else 0
  - `secondsUntilDawn(y, t): number` = `max(0, (NIGHT_LEN − b) / SUN_SPEED)` at night, 0 in the `dawn` zone, `Infinity` in the `scorch` zone
  - `sunsetsPassed(y, t): number`: how many times the sunset line has crossed y during (0, t]. With `d = wrapAlong(SUN_START_Y − y)`: 0 if `SUN_SPEED·t < d`, else `floor((SUN_SPEED·t − d)/WORLD_LEN) + 1`
  - `nearestCopy(y: number, refY: number): number`: the y' ≡ y (mod WORLD_LEN) closest to refY
  - `cityPosition(t: number): { x: number; y: number }` = `{ x: WORLD_WIDTH/2, y: wrapAlong(sunsetY(t) + CITY_BEHIND_FRAC·NIGHT_LEN) }`
  - `clock.ts`: `MAX_FRAME_SECONDS = 0.1`; `advance(t: number, deltaMs: number, paused: boolean): number`; `planetTimeLabel(realSeconds: number): string`, which formats `realSeconds·252` planet seconds as `"3D 04H"` (days, then zero-padded hours) and returns `"--"` for `Infinity`

- [ ] **Step 1: Write the failing tests:**

```ts
// world.test.ts  (N = NIGHT_LEN, L = WORLD_LEN)
test('zones at t=0', () => {
  expect(zoneAt(100, 0)).toBe('sunset');
  expect(zoneAt(0.5 * N, 0)).toBe('deep');
  expect(zoneAt(0.9 * N, 0)).toBe('predawn');
  expect(zoneAt(-100, 0)).toBe('scorch');
  expect(scorchDepth(-100, 0)).toBe(100);
  expect(zoneAt(N + 100, 0)).toBe('dawn');
});
test('sun moves toward -y', () => {
  expect(behindSunset(0, 10)).toBeCloseTo(360);
  expect(zoneAt(-100, 10)).toBe('sunset');
});
test('wrap seam is seamless', () => {
  expect(zoneAt(L - 50, 0)).toBe(zoneAt(-50, 0));
  expect(behindSunset(L + 123, 7)).toBeCloseTo(behindSunset(123, 7));
  expect(nearestCopy(10, L - 5)).toBe(L + 10);
  expect(nearestCopy(L - 10, 3)).toBe(-10);
});
test('heat rises with depth into the day', () => {
  expect(heatDps(100, 0)).toBe(0);
  expect(heatDps(-400, 0)).toBeGreaterThan(heatDps(-50, 0));
});
test('secondsUntilDawn', () => {
  expect(secondsUntilDawn(0, 0)).toBeCloseTo(N / 36);
  expect(secondsUntilDawn(N + 1, 0)).toBe(0);
});
test('sunsetsPassed steps once per pass', () => {
  expect(sunsetsPassed(-1000, 0)).toBe(0);
  expect(sunsetsPassed(-1000, 1000 / 36 + 0.01)).toBe(1);
  expect(sunsetsPassed(-1000, (1000 + L) / 36 + 0.01)).toBe(2);
});
test('city stays a fixed distance behind the sunset', () => {
  for (const t of [0, 500, 4000]) expect(behindSunset(cityPosition(t).y, t)).toBeCloseTo(0.12 * N);
});
// clock.test.ts
test('advance clamps huge deltas (tab was hidden)', () => {
  expect(advance(0, 60_000, false)).toBeCloseTo(0.1);
  expect(advance(5, 16, false)).toBeCloseTo(5.016);
  expect(advance(5, 16, true)).toBe(5);
});
test('planetTimeLabel', () => {
  expect(planetTimeLabel((3 * 86400 + 4 * 3600) / 252)).toBe('3D 04H');
  expect(planetTimeLabel(Infinity)).toBe('--');
});
```

- [ ] **Step 2: Run** `npm test` and check it fails.
- [ ] **Step 3: Implement** `world.ts` and `clock.ts` to the signatures above.
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Commit** `feat: world geometry, sun lines, zones and clock`

---

### Task 3: Terrain and Particle X

**Files:**
- Create: `src/sim/terrain.ts`, `src/sim/particles.ts`
- Test: `tests/terrain.test.ts`, `tests/particles.test.ts`

**Interfaces:**
- Consumes: `hash2`, `wrapAlong`, `behindSunset`, `zoneAt`, `sunsetsPassed`, `BALANCE`
- Produces:
  - `type Terrain = 'sand' | 'dunes' | 'rock' | 'cliff'`
  - `TERRAIN_SPEED: Record<Terrain, number>` = `{ sand: 1, dunes: 0.6, rock: 0.8, cliff: 0 }`
  - `terrainAt(seed: number, x: number, y: number): Terrain`. Returns `cliff` when `x < EDGE` or `x ≥ WORLD_WIDTH − EDGE`. Otherwise it uses 2-octave value noise on a 64 px lattice, with lattice y taken modulo `WORLD_LEN/64` so the seam is seamless. Thresholds: noise < 0.55 → sand, < 0.78 → dunes, < 0.93 → rock, else cliff. Within 300 px of the city's x-centre (`|x − WORLD_WIDTH/2| < 300`), cliff becomes rock so the city's path is never blocked.
  - `baseDensity(behind: number): number` = `DENSITY_MAX · exp(−behind / (DECAY_FRAC·NIGHT_LEN))` for `behind < NIGHT_LEN`, else 0
  - `cellHasX(seed: number, cx: number, cy: number, t: number): boolean`, where `cx, cy` are cell indices (`floor(px / CELL)`), cy is wrapped by cell count, and the result is `hash2(seed, cx, cy) < baseDensity(behindSunset(cellCentreY, t))` and the terrain isn't cliff
  - `class DepletionMap { isDepleted(cx, cy, t): boolean; mark(cx, cy, t): void; prune(t): void }`. A cell stays depleted only while `sunsetsPassed(cellCentreY, t)` equals the value stored when it was marked, so it refills after the next day. `prune` drops stale entries.
  - `collect(seed, map: DepletionMap, x: number, y: number, radius: number, t: number): number` marks every non-depleted cell with X whose centre is within `radius`, and returns `count · X_PER_CELL`

- [ ] **Step 1: Write the failing tests:**

```ts
test('edges are cliffs, the city lane is never cliff', () => {
  expect(terrainAt(1, 10, 500)).toBe('cliff');
  expect(terrainAt(1, BALANCE.WORLD_WIDTH - 10, 500)).toBe('cliff');
  for (let y = 0; y < 20000; y += 97) expect(terrainAt(1, BALANCE.WORLD_WIDTH / 2, y)).not.toBe('cliff');
});
test('terrain is seamless across the wrap', () => {
  for (let x = 100; x < 4000; x += 131) expect(terrainAt(3, x, -8)).toBe(terrainAt(3, x, BALANCE.WORLD_LEN - 8));
});
test('density is highest at the sunset and zero by day', () => {
  expect(baseDensity(0)).toBeCloseTo(0.45);
  expect(baseDensity(0.5 * NIGHT_LEN)).toBeLessThan(baseDensity(1000));
  expect(baseDensity(NIGHT_LEN + 1)).toBe(0);
});
test('collected cells stay empty until the next day passes', () => {
  const map = new DepletionMap();
  const got = collect(9, map, 2048, 400, 16, 0);
  expect(got).toBeGreaterThan(0);
  expect(collect(9, map, 2048, 400, 16, 1)).toBe(0);
  const fullDay = BALANCE.WORLD_LEN / BALANCE.SUN_SPEED;
  expect(collect(9, map, 2048, 400, 16, fullDay)).toBeCloseTo(got);
});
test('more X near the sunset than deep in the night', () => {
  const near = collect(4, new DepletionMap(), 2048, 200, 64, 0);
  const deep = collect(4, new DepletionMap(), 2048, 0.6 * NIGHT_LEN, 64, 0);
  expect(near).toBeGreaterThan(deep);
});
```

- [ ] **Step 2: Run** `npm test` and check it fails.
- [ ] **Step 3: Implement** `terrain.ts` and `particles.ts`.
- [ ] **Step 4: Run** `npm test` and check it passes.
- [ ] **Step 5: Commit** `feat: procedural terrain and Particle X density/collection`

---

### Task 4: Catalog and vehicle

**Files:**
- Create: `src/config/catalog.ts`, `src/sim/vehicle.ts`
- Test: `tests/vehicle.test.ts`

**Interfaces:**
- Produces:
  - `type SlotType = 'engine' | 'tank' | 'collector' | 'cargo' | 'armor' | 'weapon'`
  - `type HullId = 'scout' | 'hauler' | 'juggernaut'`
  - `interface Hull { id: HullId; name: string; tier: 1|2|3; price: number; baseHp: number; slots: Record<SlotType, number> }`
  - `interface Part { id: string; name: string; slot: SlotType; tier: 1|2|3; price: number; stats: { topSpeed?: number; accel?: number; tankCap?: number; collectRadius?: number; cargoCap?: number; armor?: number; hpBonus?: number; damage?: number; accuracy?: number } }`
  - `HULLS: Record<HullId, Hull>`, `PARTS: Record<string, Part>`, `REPAIR_KIT = { price: 60, heal: 40 }`
  - `interface VehicleState { hullId: HullId; fitted: Record<SlotType, (string | null)[]>; owned: string[]; hp: number; fuel: number; cargo: number; repairKits: number }`
  - `interface WeaponStats { name: string; damage: number; accuracy: number }`
  - `interface VehicleStats { maxHp; topSpeed; accel; tankCap; collectRadius; cargoCap; armor; weapons: WeaponStats[]; strength: number }` (all `number` except `weapons`)
  - `starterVehicle(): VehicleState`: scout hull with every Mk1 part fitted, full hp and fuel, 0 cargo, 1 repair kit
  - `vehicleStats(v: VehicleState): VehicleStats`. Engine stats come from the single best engine. `tankCap`, `cargoCap`, `armor` and `hpBonus` add up across fitted parts. `collectRadius` = the largest collector's radius + 4 for each extra collector. `maxHp` = `hull.baseHp + hpBonus`. `strength` = `2·hull.tier + Σ fitted part tiers`.
  - `burnFuel(v, throttle: number, seconds: number): VehicleState` (fuel −= `FUEL_PER_SECOND · |throttle| · hull.tier · seconds`, floored at 0)
  - `addCargo(v, amount: number): { v: VehicleState; added: number }` (capped at `cargoCap`)
  - `transferToTank(v): VehicleState` (moves as much cargo as fits into the tank)
  - `isBroken(v): boolean` (`hp <= 0 || fuel <= 0`)

**Catalog values** (price 0 means starter gear):

| Hull | tier | price | baseHp | slots (engine/tank/collector/cargo/armor/weapon) |
|---|---|---|---|---|
| scout "Scout" | 1 | 0 | 60 | 1/1/1/1/1/1 |
| hauler "Hauler" | 2 | 4000 | 140 | 1/1/2/1/1/2 |
| juggernaut "Juggernaut" | 3 | 15000 | 300 | 1/1/3/2/2/3 |

| Part id | slot | tier | price | stats |
|---|---|---|---|---|
| engine-1 "Sand Runner" | engine | 1 | 0 | topSpeed 80, accel 60 |
| engine-2 "Dune Hammer" | engine | 2 | 600 | topSpeed 105, accel 80 |
| engine-3 "Dusk Chaser" | engine | 3 | 2200 | topSpeed 130, accel 100 |
| tank-1 / -2 / -3 | tank | 1/2/3 | 0/400/1500 | tankCap 40/80/140 |
| collector-1 / -2 / -3 | collector | 1/2/3 | 0/500/1800 | collectRadius 8/12/18 |
| cargo-1 / -2 / -3 | cargo | 1/2/3 | 0/700/2500 | cargoCap 60/140/300 |
| armor-1 / -2 / -3 | armor | 1/2/3 | 0/900/3000 | armor 1/3/6, hpBonus 0/20/50 |
| weapon-1 "Pulse Gun" | weapon | 1 | 0 | damage 8, accuracy 0.8 |
| weapon-2 "Twin Autocannon" | weapon | 2 | 1200 | damage 14, accuracy 0.75 |
| weapon-3 "Arc Lance" | weapon | 3 | 3500 | damage 24, accuracy 0.7 |

Names for tank, collector, cargo and armor parts are the builder's call (synthwave or industrial flavour).

- [ ] **Step 1: Write the failing tests:**

```ts
test('starter vehicle stats', () => {
  const s = vehicleStats(starterVehicle());
  expect(s).toMatchObject({ maxHp: 60, topSpeed: 80, tankCap: 40, cargoCap: 60, collectRadius: 8, armor: 1, strength: 8 });
  expect(s.weapons).toEqual([{ name: 'Pulse Gun', damage: 8, accuracy: 0.8 }]);
});
test('extra collectors widen the sweep', () => {
  const v = { ...starterVehicle(), hullId: 'hauler' as const };
  v.fitted = { ...v.fitted, collector: ['collector-2', 'collector-1'] };
  expect(vehicleStats(v).collectRadius).toBe(16);
});
test('cargo caps, transfer fills tank, fuel floors at 0', () => {
  let v = starterVehicle();
  const r = addCargo(v, 100); expect(r.added).toBe(60); v = r.v;
  v = { ...v, fuel: 30 }; v = transferToTank(v);
  expect(v.fuel).toBe(40); expect(v.cargo).toBe(50);
  expect(burnFuel(v, 1, 10_000).fuel).toBe(0);
  expect(isBroken(burnFuel(v, 1, 10_000))).toBe(true);
});
test('starter keeps pace with the sun at about half throttle', () => {
  expect(vehicleStats(starterVehicle()).topSpeed * 0.5).toBeGreaterThanOrEqual(BALANCE.SUN_SPEED);
});
```

- [ ] **Step 2: Run** and check it fails. **Step 3: Implement.** **Step 4: Run** and check it passes.
- [ ] **Step 5: Commit** `feat: hull/part catalog and vehicle stats`

---

### Task 5: Game state, economy and saving

**Files:**
- Create: `src/sim/game-state.ts`, `src/sim/economy.ts`, `src/sim/save.ts`
- Test: `tests/economy.test.ts`, `tests/save.test.ts`

**Interfaces:**
- Consumes: Task 2 `cityPosition`, Task 4 everything
- Produces:
  - `interface GameState { version: 1; seed: number; t: number; player: { x: number; y: number; heading: number }; vehicle: VehicleState; credits: number; debt: number; flags: { easyStartOver: boolean; firstRescueUsed: boolean; won: boolean; victoryShown: boolean } }`
  - `newGame(seed: number): GameState`: t = 0, the player sits at `cityPosition(0)` offset +40 px in x (the dock side), heading = −π/2 (facing the sunset), starter vehicle, 0 credits, 0 debt, all flags false
  - `type TxResult = { ok: true; state: GameState } | { ok: false; reason: 'credits' | 'slot' | 'not-owned' | 'nothing' }`
  - `sellCargo(s): TxResult`: proceeds = `cargo · X_SELL_PRICE`, paid to debt first and the rest to credits; cargo becomes 0 and `easyStartOver` becomes true; returns `nothing` if cargo is 0
  - `buyPart(s, partId): TxResult` (adds to `owned`), `fitPart(s, partId, slot: SlotType, index: number): TxResult` (moves the part from `owned` into the slot, and any part already there back to `owned`), `unfitPart(s, slot, index): TxResult`
  - `buyHull(s, hullId): TxResult`: keeps fitted parts and extends the slot arrays with `null`. Buying `juggernaut` sets `won`.
  - `buyRepairKit(s)`, `repairFull(s)` (cost `ceil(missingHp · REPAIR_COST_PER_HP)`; if credits are short, repairs as many HP as they cover), `refuelFull(s)` (cost `ceil(missingFuel · X_BUY_PRICE)`; same partial rule)
  - Credits never go below 0. Every function returns a new state and never mutates its input.
  - `save.ts`: `SAVE_KEY = 'drive-all-night/save-v1'`; `interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }`; `safeStorage(): KV | null` (catches access errors and returns null); `serialize(s): string`; `deserialize(raw: string | null): GameState | null` (null for bad JSON, `version !== 1`, or missing `vehicle`/`player`/`flags`); `saveGame(s, kv = safeStorage()): boolean`; `loadGame(kv = safeStorage()): GameState | null`

- [ ] **Step 1: Write the failing tests:**

```ts
test('sale pays debt first and ends the easy start', () => {
  let s = newGame(1); s = { ...s, debt: 100, vehicle: { ...s.vehicle, cargo: 50 } };
  const r = sellCargo(s); if (!r.ok) throw 0;
  expect(r.state.debt).toBe(0); expect(r.state.credits).toBe(150);
  expect(r.state.vehicle.cargo).toBe(0); expect(r.state.flags.easyStartOver).toBe(true);
});
test('debt larger than the sale', () => {
  let s = newGame(1); s = { ...s, debt: 1000, vehicle: { ...s.vehicle, cargo: 10 } };
  const r = sellCargo(s); if (!r.ok) throw 0;
  expect(r.state.debt).toBe(950); expect(r.state.credits).toBe(0);
});
test('cannot buy without credits', () => {
  expect(buyPart(newGame(1), 'engine-2')).toEqual({ ok: false, reason: 'credits' });
});
test('fit swaps parts and buying the juggernaut wins', () => {
  let s = { ...newGame(1), credits: 20000 };
  let r = buyPart(s, 'engine-2'); if (!r.ok) throw 0;
  r = fitPart(r.state, 'engine-2', 'engine', 0); if (!r.ok) throw 0;
  expect(r.state.vehicle.fitted.engine).toEqual(['engine-2']);
  expect(r.state.vehicle.owned).toContain('engine-1');
  r = buyHull(r.state, 'juggernaut'); if (!r.ok) throw 0;
  expect(r.state.flags.won).toBe(true);
  expect(r.state.vehicle.fitted.weapon).toEqual(['weapon-1', null, null]);
});
test('partial repair when short on credits', () => {
  const s0 = newGame(1);
  const s = { ...s0, credits: 10, vehicle: { ...s0.vehicle, hp: 20 } };
  const r = repairFull(s); if (!r.ok) throw 0;
  expect(r.state.vehicle.hp).toBe(25); expect(r.state.credits).toBe(0);
});
// save.test.ts
const mem = (): KV => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }; };
test('round trip', () => { const kv = mem(); const s = newGame(5); expect(saveGame(s, kv)).toBe(true); expect(loadGame(kv)).toEqual(s); });
test('bad saves load as null', () => {
  for (const raw of [null, '', '{', '{"version":2}', '{"version":1}']) expect(deserialize(raw)).toBeNull();
});
test('blocked storage does not throw', () => {
  const broken: KV = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  expect(loadGame(broken)).toBeNull(); expect(saveGame(newGame(1), broken)).toBe(false);
  expect(loadGame(null)).toBeNull();
});
```

- [ ] **Step 2: Run** and check it fails. **Step 3: Implement.** **Step 4: Run** and check it passes.
- [ ] **Step 5: Commit** `feat: game state, city economy and local save`

---

### Task 6: Pirates and turn-based battle rules

**Files:**
- Create: `src/sim/pirates.ts`, `src/sim/battle.ts`
- Test: `tests/pirates.test.ts`, `tests/battle.test.ts`

**Interfaces:**
- Consumes: `Rng`, `Zone`, `VehicleStats`, `GameState`, `addCargo`
- Produces:
  - `interface Pirate { name: string; level: number; hp: number; maxHp: number; damage: number; accuracy: number; armor: number; speed: number }`
  - `spawnChancePerSecond(zone: Zone, cargo: number, easy: boolean): number`. Sunset zone: `0.02 + 0.0002·cargo`. Deep: `0.004`. Any other zone: 0. Multiply by 0.25 while `easy`.
  - `pirateLevel(strength: number, cargo: number, easy: boolean): number`: 1 if easy, else `max(1, round(0.5·strength + cargo/100))`
  - `makePirateGroup(rng: Rng, level: number, easy: boolean): Pirate[]`. Group size: 1 if easy, else `1 + (level ≥ 6 ? 1 : 0) + (level ≥ 10 ? 1 : 0)`. Each pirate has hp `20 + 8L`, damage `4 + 2L`, accuracy 0.65, armor `floor(L/3)` and speed `70 + 4L`. Names are picked from a small list of original names.
  - `class Grace { constructor(seconds = GRACE_SECONDS); start(): void; tick(dt: number): void; get active(): boolean }`
  - `type Action = { type: 'fire'; weapon: number; target: number } | { type: 'brace' } | { type: 'repair' } | { type: 'flee' }`
  - `interface BattleState { round: number; player: { hp: number; maxHp: number; armor: number; speed: number; weapons: WeaponStats[]; repairKits: number }; enemies: Pirate[]; log: string[]; outcome: 'ongoing' | 'won' | 'lost' | 'fled' }`
  - `startBattle(stats: VehicleStats, v: VehicleState, enemies: Pirate[]): BattleState`
  - `takeTurn(b: BattleState, a: Action, rng: Rng): BattleState`. The player acts first:
    - **fire:** hits if `rng() < accuracy`, damage `max(1, dmg − target.armor)`.
    - **brace:** halves incoming damage this round, rounding up.
    - **repair:** if `repairKits > 0`, `hp = min(maxHp, hp + REPAIR_KIT.heal)`; with no kits it does nothing and adds a log line.
    - **flee:** succeeds if `rng() < clamp(0.35 + (speed − maxEnemySpeed)/100, 0.1, 0.9)`.

    Then, unless the outcome is decided, each living enemy hits if `rng() < accuracy` for `max(1, damage − armor)`. The outcome is `won` when all enemies are at 0 hp and `lost` when player hp is 0. Each event adds a short log line.
  - `battleLoot(enemies: Pirate[], rng: Rng): { credits: number; cargo: number }`. Each pirate gives `30·L + floor(rng()·20·L)` credits and `8·L` cargo.
  - `applyBattleResult(s: GameState, b: BattleState, loot: { credits: number; cargo: number }): GameState`. On `won`: copy over hp and repair kits, then add credits and cargo (cargo capped). On `fled`: copy over hp and repair kits. On `lost`: hp 0 and cargo 0, fuel unchanged.

- [ ] **Step 1: Write the failing tests:**

```ts
test('pirates hunt the sunset band, rarely elsewhere, gently at first', () => {
  expect(spawnChancePerSecond('sunset', 0, false)).toBeGreaterThan(spawnChancePerSecond('deep', 0, false));
  expect(spawnChancePerSecond('predawn', 500, false)).toBe(0);
  expect(spawnChancePerSecond('sunset', 100, false)).toBeGreaterThan(spawnChancePerSecond('sunset', 0, false));
  expect(spawnChancePerSecond('sunset', 0, true)).toBeCloseTo(0.005);
});
test('the starter vehicle beats an easy-start pirate', () => {
  let wins = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed), v = starterVehicle();
    let b = startBattle(vehicleStats(v), v, makePirateGroup(rng, 1, true));
    while (b.outcome === 'ongoing') b = takeTurn(b, { type: 'fire', weapon: 0, target: 0 }, rng);
    if (b.outcome === 'won') wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(190);
});
test('brace halves damage, repair needs a kit', () => {
  const v = starterVehicle(), p = makePirateGroup(() => 0, 1, true);
  const alwaysHit = () => 0;
  const b0 = startBattle(vehicleStats(v), v, p);
  const braced = takeTurn(b0, { type: 'brace' }, alwaysHit);
  expect(b0.player.hp - braced.player.hp).toBe(Math.ceil((6 - 1) / 2));
  const noKit = takeTurn({ ...b0, player: { ...b0.player, repairKits: 0, hp: 10 } }, { type: 'repair' }, () => 0.99);
  expect(noKit.player.hp).toBe(10);
});
test('losing takes cargo, not fuel', () => {
  const s0 = newGame(1); const s = { ...s0, vehicle: { ...s0.vehicle, cargo: 40, fuel: 22 } };
  const lost: BattleState = { ...startBattle(vehicleStats(s.vehicle), s.vehicle, []), outcome: 'lost' };
  const r = applyBattleResult(s, lost, { credits: 0, cargo: 0 });
  expect(r.vehicle).toMatchObject({ cargo: 0, fuel: 22, hp: 0 });
});
test('grace window after a battle', () => {
  const g = new Grace(4); g.start(); expect(g.active).toBe(true);
  g.tick(3.9); expect(g.active).toBe(true); g.tick(0.2); expect(g.active).toBe(false);
});
```

- [ ] **Step 2: Run** and check it fails. **Step 3: Implement.** **Step 4: Run** and check it passes.
- [ ] **Step 5: Commit** `feat: pirate generation and turn-based battle rules`

---

### Task 7: Rescue rules

**Files:**
- Create: `src/sim/rescue.ts`
- Test: `tests/rescue.test.ts`

**Interfaces:**
- Consumes: `Rng`, `Zone`, `GameState`, `vehicleStats`
- Produces:
  - `type RescueOutcome = { type: 'rescued'; waitSeconds: number; fee: number } | { type: 'pirates'; waitSeconds: number } | { type: 'destroyed'; waitSeconds: number }` (wait times are world seconds)
  - `RESCUE_TABLE: Record<'sunset' | 'deep' | 'predawn' | 'scorch', { pirateChance: number; waitMin: number; waitMax: number; fee: number }>` =
    sunset `{0.3, 20, 60, 150}`, deep `{0, 120, 600, 300}`, predawn `{0, 300, 900, 500}`, scorch `{0, 10, 30, 400}`. Add `SCORCH_SURVIVE_SECONDS = 20` to `BALANCE`.
  - `rollRescue(rng: Rng, zone: Zone, secondsUntilDawn: number, firstRescueUsed: boolean): RescueOutcome`:
    - First rescue (`!firstRescueUsed`) and not in the `dawn` zone: `{ rescued, 15, fee 0 }`.
    - `dawn` zone: `destroyed`, wait 0.
    - Otherwise roll the pirates chance first and return `pirates` with a wait from the table.
    - If not pirates, roll the wait. It's `destroyed` if `wait ≥ secondsUntilDawn`, or if the zone is `scorch` and `wait > SCORCH_SURVIVE_SECONDS`. Else `rescued` with the zone's fee.
  - `applyRescue(s: GameState, o: RescueOutcome): GameState`. Always `t += waitSeconds`.
    - **rescued:** `hp = max(hp, ceil(0.25·maxHp))` and `fuel = max(fuel, RESCUE_FUEL)`. The fee comes out of credits, and whatever credits can't cover goes onto `debt`. `firstRescueUsed = true`.
    - **pirates:** cargo becomes 0.
    - **destroyed:** state is otherwise unchanged; the caller reloads the save.

- [ ] **Step 1: Write the failing tests:**

```ts
test('first rescue is free and guaranteed', () => {
  for (const z of ['sunset', 'deep', 'predawn', 'scorch'] as const)
    expect(rollRescue(makeRng(1), z, 9999, false)).toEqual({ type: 'rescued', waitSeconds: 15, fee: 0 });
});
test('sunset calls sometimes bring pirates, deep calls never do', () => {
  const kinds = (z: Zone) => new Set(Array.from({ length: 300 }, (_, i) => rollRescue(makeRng(i), z, 1e6, true).type));
  expect(kinds('sunset').has('pirates')).toBe(true);
  expect(kinds('deep').has('pirates')).toBe(false);
});
test('the dawn wins if help is slower', () => {
  expect(rollRescue(makeRng(3), 'predawn', 100, true).type).toBe('destroyed');
});
test('unpaid fee becomes debt', () => {
  const s = { ...newGame(1), credits: 100, vehicle: { ...newGame(1).vehicle, hp: 0, fuel: 0 } };
  const r = applyRescue(s, { type: 'rescued', waitSeconds: 30, fee: 300 });
  expect(r).toMatchObject({ credits: 0, debt: 200, t: 30 });
  expect(r.vehicle.hp).toBe(15); expect(r.vehicle.fuel).toBe(15);
  expect(r.flags.firstRescueUsed).toBe(true);
});
```

- [ ] **Step 2: Run** and check it fails. **Step 3: Implement.** **Step 4: Run** and check it passes.
- [ ] **Step 5: Commit** `feat: distress call outcomes`

---

### Task 8: Procedural pixel art and gallery

**Files:**
- Create: `src/art/palette.ts`, `src/art/font.ts`, `src/art/painters.ts`, `src/scenes/GalleryScene.ts`
- Modify: `src/scenes/BootScene.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `hash2`, `terrainAt`, `HullId`, `VehicleState`, `BALANCE`
- Produces:
  - `PAL`: named colours copied from the mockup (`ink '#07030c'`, `night '#1b0a33'`, `cyan '#3ef0ff'`, `pink '#ff2bd6'`, `amber '#ffd23f'`, `dawn '#bcd8ff'`, `pirate '#7dff3a'`, `SUN: string[]` with the 12 stripe colours, plus the rig, gunmetal and olive ramps)
  - `drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, glow?: string): void` and `textWidth(s: string): number`, using the mockup's 3×5 font extended to the full A–Z, 0–9 and `: . / - > < ! % +`
  - `paintRig(v: VehicleState, treadPhase: 0|1|2): HTMLCanvasElement`, facing up:
    - **scout:** the armored cab alone, about 18×22 px.
    - **hauler:** cab + tracked collector unit, about 34×52 px, like the mockup.
    - **juggernaut:** cab + two units, about 40×80 px.
    - Fitted weapons add turrets; extra collectors widen the intake bar.
  - `paintPirate(level: number): HTMLCanvasElement` (24×20 gunship; higher levels get darker hulls and more pods)
  - `paintCity(): HTMLCanvasElement` (about 120×260 px, the mockup's city scaled up: treads, domes, tanks, mast, windows, DOCK sign side on the right)
  - `paintGroundChunk(seed: number, chunkX: number, chunkY: number): HTMLCanvasElement` (256×256 px: base purple, speckles, rim-lit dunes, rocks, cliff walls, cyan grid lines every 20 px at alpha 0.3, all wrap-safe)
  - Texture keys registered in `BootScene`: `rig-<hullId>-<fittedHash>-<phase>` (made on demand by `ensureRigTextures(scene, v): string[]`), `pirate-<level>`, `city`, and chunks made on demand by `ensureChunk(scene, seed, cx, cy): string` with an LRU of 64
- Port `bevel`, `wheel`, `tread` and `circle` from `mockups/synthwave-driving-v2.html` into `painters.ts` as functions that take a `CanvasRenderingContext2D`.

- [ ] **Step 1: Implement** `palette.ts`, `font.ts` and `painters.ts`, and register textures in `BootScene`.
- [ ] **Step 2: Add `GalleryScene`** (key `'gallery'`), opened when the URL has `?gallery`. It shows at 2× each hull with starter parts, the hauler with Mk3 parts, pirates level 1, 5 and 10, the city, two ground chunks, and the font alphabet, each with a label.
- [ ] **Step 3: Verify.** Run `npm run typecheck`, then `npm run dev`, then open `/?gallery` in the browser pane and screenshot it. Check against the spec's art direction: solid shaded bodies with dark outlines (not outlines alone), animated tread phases that differ, neon only as accents, and pirates that read as flying gunships. Fix anything off before committing.
- [ ] **Step 4: Commit** `feat: procedural synthwave sprites and gallery`

---

### Task 9: Driving scene: world, collecting, fuel, sun hazards, HUD

**Files:**
- Create: `src/game/session.ts`, `src/scenes/DriveScene.ts`, `src/scenes/HudScene.ts`, `src/scenes/drive/ground.ts`, `src/scenes/drive/particles-layer.ts`, `src/scenes/drive/lighting.ts`
- Modify: `src/main.ts`, `src/scenes/BootScene.ts` (after boot it starts `'drive'` with a `newGame(randomSeed())` for now)

**Interfaces:**
- Consumes: everything in Tasks 2–5 and 8
- Produces:
  - `session.ts`: `getState(): GameState`, `setState(s: GameState): void`, `depletion: DepletionMap`, `resetDepletion(): void`, `onDestroyed: (reason: 'dawn' | 'heat') => void` (set by DriveScene)
  - Scene keys `'drive'` and `'hud'`. HUD runs in parallel above drive and reads `getState()` every frame.
  - `DriveScene` exposes `setFrozen(frozen: boolean)` for later tasks (it stops input and the clock).

**Behaviour to build:**
- **Controls:** W/↑ throttle; S/↓ brake, then reverse at 40% speed; A/D or ←/→ steer; F moves cargo into the tank (`transferToTank`).
- **Handling:** arcade, with heading turn rate 2.6 rad/s scaled down at low speed. Velocity eases toward heading direction × speed (grip 6/s) for a little drift. Top speed = `topSpeed · TERRAIN_SPEED[terrainAt(...)]`. Moving into `cliff` cancels the move and halves speed, with no damage.
- **Each frame:** `t = advance(t, delta, frozen)`; `burnFuel(throttle)`; `collect(...)` at the rear-centre of the rig with `collectRadius`, then `addCargo`; `prune` once a second. Then apply `heatDps` as hull damage. If the zone is `dawn`, call `onDestroyed('dawn')`. `isBroken` freezes driving; the rescue flow is Task 12, so for now just show "BROKEN DOWN".
- **Camera** follows the rig, with the rig sitting 60 px below centre so you see more of what's ahead (toward the sunset).
- **Ground:** `ground.ts` keeps a 3×3 window of chunk sprites around the camera using `ensureChunk`, with chunk y wrapped.
- **Particles:** `particles-layer.ts` uses one `Graphics` cleared each frame. For every on-screen cell with `cellHasX && !isDepleted`, it draws one pixel twinkling cyan → white → blue by `hash2` and time. Cells with a hash under 18% of density also get a faint + glow.
- **Lighting** (`lighting.ts`, screen-space, above the world):
  - Darkness with alpha by zone: sunset 0.1, deep 0.4, predawn 0.3.
  - A headlight cone cut out of the darkness.
  - The striped sunset band drawn at the screen y of `nearestCopy(sunsetY(t), player.y)` when it's on screen, with a pink glow fading below it, and an orange-white glare over the scorch side above it.
  - A cold dawn haze at the bottom edge with alpha `0.25 · (1 − min(1, secondsUntilDawn/120))`.
- **City:** a sprite at `nearestCopy(cityPosition(t))` that moves with the sun. When the player is within `DOCK_RADIUS` of the dock point (right edge, mid-height), show "E: DOCK". Pressing E does nothing yet; Task 11 wires it.
- **HUD (480×270, `drawText`-style bitmap text):**
  - FUEL, CARGO and HULL segmented bars, plus `CR <credits>` and `DEBT <n>` when there's debt.
  - A strip map from dawn (left, pale blue) to sunset (right, orange) with markers for you and the city.
  - `DAWN IN <planetTimeLabel>`.
  - Context prompts (`E: DOCK`, `F: FUEL FROM CARGO` when fuel < 30% and cargo > 0).
  - A flashing `SCORCHING!` in the scorch zone.
- **Destruction:** `onDestroyed` shows "THE DAWN CAUGHT YOU" or "BURNED BY THE SUN" for 2 s. Then it runs `loadGame()`; if there's no save it uses `newGame(seed)`. Then `resetDepletion()` and the drive scene restarts.

- [ ] **Step 1: Implement** `session.ts` and the drive modules and scenes above.
- [ ] **Step 2: Verify the build.** `npm run typecheck && npm test && npm run build` all pass.
- [ ] **Step 3: Verify in the browser pane** (`npm run dev`):
  - Driving feels smooth, and dunes slow you down.
  - Particle X sparkles thickest near the sunset band and disappears where you drive.
  - Cargo and fuel bars move, and F transfers cargo into the tank.
  - Driving up past the sunset band shows glare and `SCORCHING!`, and hull damage rises.
  - Hiding the tab for 30 s and coming back doesn't jump the sun.
  - Temporarily set `SUN_START_Y` so the player starts in predawn: the dawn haze grows and destruction reloads.
  - The city drifts along with the night.
- [ ] **Step 4: Verify the wrap seam.** Temporarily start the player at y = 50 heading toward −y, and drive through y = 0. The ground, sparks and HUD don't jump.
- [ ] **Step 5: Commit** `feat: real-time driving with Particle X, sun hazards and HUD`

---

### Task 10: Pirates on the map and the battle scene

**Files:**
- Create: `src/scenes/drive/pirates-map.ts`, `src/scenes/BattleScene.ts`
- Modify: `src/scenes/DriveScene.ts`

**Interfaces:**
- Consumes: Task 6 everything, `session`, `setFrozen`
- Produces: scene key `'battle'`, started with data `{ enemies: Pirate[] }`. On finish it calls `setState(applyBattleResult(...))`, stops itself, and resumes `'drive'` with the event `'battle-done'`.

**Behaviour to build:**
- **Pirates on the map** (`pirates-map.ts`):
  - Once per second, roll `spawnChancePerSecond(zoneAt(player), cargo, !easyStartOver)`. Skip the roll while `Grace.active` or while any group is already on the map. (The cap is 1 group in the easy start and 2 after.)
  - Spawn 220 px from the player toward the sunset side, ±120 px across, at `pirateLevel(strength, cargo, easy)`.
  - The group's sprite flies toward the player at `0.9 · group max speed` and casts a ground shadow 6 px across and 10 px down. A flashing `!` warns while it's within 160 px.
  - Contact within `CONTACT_RADIUS` → `setFrozen(true)`, then launch `'battle'`.
  - Groups more than 600 px away give up.
- **BattleScene layout:** your rig on the left, enemies on the right with hp bars, and a log showing the last 4 lines. Keys: `1`–`3` fire weapon N at the selected target (←/→ choose the target), `B` brace, `R` repair (dimmed when there are no kits), `X` flee. A short flash or shake on hits.
- **When the battle ends,** show the result for 1.5 s.
  - `won`: show the `battleLoot` amounts.
  - `lost`: show "THEY STRIPPED YOUR CARGO".
- **Back on the map** (`'battle-done'`): clear all groups, `Grace.start()`, `setFrozen(false)`. If `isBroken`, the broken-down state takes over.
- The world clock doesn't advance during battle, because DriveScene is frozen.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify the build.** `npm run typecheck && npm test && npm run build` all pass.
- [ ] **Step 3: Verify in the browser pane:**
  - Temporarily multiply the spawn chance by 50. A pirate appears near the sunset, chases you, and contact opens the battle.
  - Firing, bracing, repair and flee all work and log.
  - Winning adds credits and cargo, and losing empties cargo.
  - After fleeing, no new battle starts for 4 s.
  - The dawn timer doesn't change during the battle.
  - Revert the multiplier.
- [ ] **Step 4: Commit** `feat: pirates on the map and turn-based battles`

---

### Task 11: The moving city: trade, garage, save, victory

**Files:**
- Create: `src/scenes/CityScene.ts`, `src/scenes/VictoryScene.ts`
- Modify: `src/scenes/DriveScene.ts`

**Interfaces:**
- Consumes: Task 5 economy and save, `paintRig`, `session`, `setFrozen`
- Produces: scene key `'city'`. It's entered by pressing E in the dock zone. On entry it runs `saveGame(getState())` (autosave). Leaving places the player 40 px right of the dock, facing the sunset, and unfreezes. Scene key `'victory'` is shown once when `won && !victoryShown`, then sets `victoryShown` and returns to the city.

**Behaviour to build:**
- A full-screen synthwave menu with a city backdrop, the rig preview (`paintRig` at 2×), and credits, debt, cargo, hp and fuel at the top. Tabs are switched with ←/→ or clicking:
  - **SELL:** shows `cargo × X_SELL_PRICE` and what goes to debt; Enter sells.
  - **SHOP:** hulls and parts with price, tier and the stats they change compared with what you have fitted, plus repair kits. Rows you can't afford are dimmed. Enter buys.
  - **GARAGE:** your slots by type. Pick a slot, then pick an owned part to fit, or unfit what's there.
  - **SERVICES:** repair (shows the cost) and refuel (shows the cost).
  - **SAVE:** saves and shows "SAVED" (or "COULD NOT SAVE" if `saveGame` returns false).
  - **LEAVE.**
- Every action calls the economy function. A `{ ok: false }` result shows a short reason ("NOT ENOUGH CREDITS", "NO FREE SLOT").
- **Victory screen:** "YOU MADE IT — THE JUGGERNAUT IS YOURS", a short line saying you can keep driving, and the rig. Any key returns to the city.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify the build.** `npm run typecheck && npm test && npm run build` all pass.
- [ ] **Step 3: Verify in the browser pane:**
  - Collect, dock, and sell: credits rise, and the easy-start flag flips (check `getState()` in the console).
  - Buy and fit an engine and see top speed rise when driving.
  - Save, reload the page, and continue loading the city save. (Continue arrives in Task 12; for now call `loadGame()` in the console.)
  - Set credits to 20000 in the console and buy the Juggernaut: the victory screen shows once, and the rig sprite changes.
- [ ] **Step 4: Commit** `feat: moving city with trade, garage, save and victory`

---

### Task 12: Breakdowns, rescue call, title screen and deploy

**Files:**
- Create: `src/scenes/drive/rescue-flow.ts`, `src/scenes/TitleScene.ts`, `.github/workflows/pages.yml`
- Modify: `src/scenes/DriveScene.ts`, `src/scenes/BootScene.ts`, `src/main.ts`

**Interfaces:**
- Consumes: Task 7 rescue, Task 5 save, `session`, `setFrozen`, `onDestroyed`
- Produces: scene key `'title'`. Boot goes to title. Title shows **CONTINUE** only when `loadGame()` returns a state, and **NEW GAME** always. New game runs `newGame(randomSeed())`, then `saveGame`, `resetDepletion`, and starts `'drive'`.

**Behaviour to build:**
- **Broken down** (`isBroken`): the rig stops, its lights flicker, and the HUD shows `BROKEN DOWN — H: CALL FOR HELP` plus `DAWN IN …`. Heat damage still applies in scorch.
- **On H:**
  - `setFrozen(true)` and `rollRescue(rng, zoneAt, secondsUntilDawn, firstRescueUsed)`.
  - Show a "DISTRESS CALL SENT…" overlay for 2 s with the planet clock fast-forwarding through `waitSeconds`.
  - Then `setState(applyRescue(...))` and show the result.
    - **rescued:** "A COLLECTOR CREW PATCHED YOU UP: FEE <n>" (and "ADDED TO DEBT" if needed). Unfreeze.
    - **pirates:** "PIRATES ANSWERED YOUR CALL. THEY TOOK YOUR CARGO". You can call again.
    - **destroyed:** call `onDestroyed('dawn')`, or `'heat'` in scorch.
- **Title screen:** the synthwave title "DRIVE ALL NIGHT" over the striped sun, menu with ↑/↓ + Enter, and a controls hint line.
- **Deploy:** `pages.yml` on push to `main` runs `npm ci`, `npm test` and `npm run build`, then uploads `dist` with `actions/upload-pages-artifact` and deploys with `actions/deploy-pages`. Pushing and turning on Pages in the repository settings are the user's call; don't push.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify the build.** `npm run typecheck && npm test && npm run build` all pass.
- [ ] **Step 3: Verify in the browser pane:**
  - New game starts next to the city.
  - Run out of fuel (temporarily set `FUEL_PER_SECOND` to 5). The first call is free and patches you up.
  - Break down again in the sunset band repeatedly and see both rescue and pirate outcomes.
  - Break down in predawn (set a start position) and see destruction lead to a reload of the last save.
  - Corrupt the save in the console (`localStorage.setItem('drive-all-night/save-v1','{')`) and reload: the title shows only NEW GAME, with no errors in the console.
  - Revert the temporary values.
- [ ] **Step 4: Verify a full loop.** From a new game: collect, sell, upgrade, fight a pirate, break down, get rescued, dock, save, and reload with Continue.
- [ ] **Step 5: Commit** `feat: rescue calls, title screen and Pages workflow`
