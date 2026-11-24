import { BALANCE } from '../src/config/balance';
import { CITY_LANES, LANE_HALF } from '../src/config/cities';
import {
  MINE_COUNT,
  MINE_ENTRY_RADIUS,
  adjustStanding,
  baronPrice,
  baronStock,
  buyFromBaron,
  discoverMines,
  isMineOpen,
  mineSites,
  relation,
  statusOf,
  swearAlliance,
  tributeCredits,
  tributeX,
} from '../src/sim/barons';
import { newGame, type GameState } from '../src/sim/game-state';
import { isPassable, terrainAt } from '../src/sim/terrain';
import { sunsetY, wrapAlong } from '../src/sim/world';

function ok(r: { ok: boolean; state?: GameState }): GameState {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
}

test('twelve mines, deterministic per world, off the city lanes and on open ground', () => {
  const mines = mineSites(7);
  expect(mines).toHaveLength(MINE_COUNT);
  expect(mineSites(7)).toEqual(mines);
  expect(mineSites(8)).not.toEqual(mines);
  for (const m of mines) {
    for (const lane of CITY_LANES) expect(Math.abs(m.x - lane)).toBeGreaterThanOrEqual(LANE_HALF);
    for (const [dx, dy] of [
      [0, 0],
      [30, 0],
      [-30, 0],
      [0, 30],
      [0, -30],
    ]) {
      expect(isPassable(terrainAt(7, m.x + dx, m.y + dy))).toBe(true);
    }
    expect(m.baron.length).toBeGreaterThan(0);
    expect(['warlike', 'wary', 'trader']).toContain(m.temper);
  }
  expect(new Set(mines.map((m) => m.id)).size).toBe(MINE_COUNT);
  expect(new Set(mines.map((m) => m.temper)).size).toBeGreaterThan(1);
});

test('standing starts from the baron temper and maps to a status', () => {
  const s = newGame(7);
  for (const m of mineSites(7)) {
    const r = relation(s, m);
    expect(r.standing).toBe(m.temper === 'warlike' ? -40 : m.temper === 'wary' ? 0 : 20);
    expect(r.allied).toBe(false);
  }
  expect(statusOf({ standing: -21, allied: false })).toBe('HOSTILE');
  expect(statusOf({ standing: -5, allied: false })).toBe('WARY');
  expect(statusOf({ standing: 0, allied: false })).toBe('NEUTRAL');
  expect(statusOf({ standing: 40, allied: false })).toBe('FRIENDLY');
  expect(statusOf({ standing: 10, allied: true })).toBe('ALLIED');
});

test('a mine is open only while it is in darkness', () => {
  const m = mineSites(7)[0];
  // sunset 200 px ahead of the mine: the mine is in the sunset band
  const tNight = wrapAlong(-(m.y - 200)) / BALANCE.SUN_SPEED;
  // sunset 200 px behind the mine: the mine is in the scorching day
  const tDay = wrapAlong(-(m.y + 200)) / BALANCE.SUN_SPEED;
  expect(wrapAlong(m.y - sunsetY(tNight))).toBeCloseTo(200, 0);
  expect(isMineOpen(m, tNight)).toBe(true);
  expect(isMineOpen(m, tDay)).toBe(false);
});

test('mines are discovered once within sight, and only once', () => {
  const s = newGame(7);
  const m = mineSites(7)[3];
  expect(discoverMines(s, m.x + 2000, m.y, 700)).toEqual([]);
  expect(discoverMines(s, m.x + 600, m.y, 700)).toEqual([m.id]);
  expect(discoverMines({ ...s, known: [m.id] }, m.x, m.y, 700)).toEqual([]);
  expect(discoverMines(s, m.x + 1000, m.y, 1100)).toEqual([m.id]); // scouts see further
});

test('tribute raises standing: Particle X or credits', () => {
  const m = mineSites(7)[0];
  const base = newGame(7);
  const s0 = { ...base, credits: 1000, vehicle: { ...base.vehicle, cargo: 25 } };
  const before = relation(s0, m).standing;
  const x = ok(tributeX(s0, m.id));
  expect(x.vehicle.cargo).toBe(15);
  expect(relation(x, m).standing).toBe(before + 4);
  const cr = ok(tributeCredits(s0, m.id));
  expect(cr.credits).toBe(800);
  expect(relation(cr, m).standing).toBe(before + 5);
  expect(tributeX({ ...s0, vehicle: { ...s0.vehicle, cargo: 5 } }, m.id)).toEqual({ ok: false, reason: 'nothing' });
  expect(tributeCredits({ ...s0, credits: 10 }, m.id)).toEqual({ ok: false, reason: 'credits' });
});

test('standing is clamped between -100 and 100', () => {
  const m = mineSites(7)[0];
  expect(relation(adjustStanding(newGame(7), m.id, 999), m).standing).toBe(100);
  expect(relation(adjustStanding(newGame(7), m.id, -999), m).standing).toBe(-100);
});

test('an alliance needs a friendly baron and a 500 CR oath-gift', () => {
  const m = mineSites(7)[0];
  const s0 = { ...newGame(7), credits: 1000 };
  const set = (s: GameState, value: number) => adjustStanding(s, m.id, value - relation(s, m).standing);
  expect(swearAlliance(set(s0, 10), m.id)).toEqual({ ok: false, reason: 'refused' });
  const friendly = set(s0, 45);
  const allied = ok(swearAlliance(friendly, m.id));
  expect(relation(allied, m).allied).toBe(true);
  expect(allied.credits).toBe(500);
  expect(statusOf(relation(allied, m))).toBe('ALLIED');
  expect(swearAlliance({ ...friendly, credits: 100 }, m.id)).toEqual({ ok: false, reason: 'credits' });
});

test('barons trade only with those they do not mistrust, cheaper for friends', () => {
  const m = mineSites(7)[0];
  const stock = baronStock(m);
  expect(stock.length).toBeGreaterThan(2);
  const part = stock[0];
  const rich = { ...newGame(7), credits: 99999 };
  const set = (s: GameState, value: number) => adjustStanding(s, m.id, value - relation(s, m).standing);
  expect(buyFromBaron(set(rich, -10), m.id, part)).toEqual({ ok: false, reason: 'refused' });
  const bought = ok(buyFromBaron(set(rich, 0), m.id, part));
  expect(bought.vehicle.owned).toContain(part);
  expect(baronPrice(1000, { standing: 0, allied: false })).toBe(1200);
  expect(baronPrice(1000, { standing: 50, allied: false })).toBe(1000);
  expect(baronPrice(1000, { standing: 50, allied: true })).toBe(800);
  expect(buyFromBaron(set(rich, 0), m.id, 'not-a-part')).toEqual({ ok: false, reason: 'nothing' });
});

test('every mine has an open entrance and a safe exit point, in every world', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const m of mineSites(seed)) {
      expect(isPassable(terrainAt(seed, m.x, m.y + 24))).toBe(true);
      expect(isPassable(terrainAt(seed, m.exitX, m.exitY))).toBe(true);
      expect(Math.hypot(m.exitX - m.x, m.exitY - (m.y + 24))).toBeLessThanOrEqual(MINE_ENTRY_RADIUS);
    }
  }
});
