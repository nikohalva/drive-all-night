import { buyEscort, caravanStats, repairEscorts, sellEscort } from '../src/sim/caravan';
import { startBattle } from '../src/sim/battle';
import { seatsAt } from '../src/sim/crew';
import { buyHull, fitPart } from '../src/sim/economy';
import { escortStats } from '../src/sim/escort-stats';
import { driveRig, sellStored, takeEscort, parkEscort } from '../src/sim/garage';
import { newGame, type GameState } from '../src/sim/game-state';
import { fitEscort, unfitEscort } from '../src/sim/outfit';
import { deserialize, loadGame, SAVE_KEY, serialize } from '../src/sim/save';
import { CITY_BY_ID } from '../src/config/cities';

const ok = (r: { ok: boolean; state?: GameState }): GameState => {
  if (!r.ok || !r.state) throw new Error('expected an ok transaction');
  return r.state;
};
/** A scout with a better engine fitted, rich enough for a hauler. */
const tuned = (): GameState => {
  const s = newGame(1);
  return ok(fitPart({ ...s, credits: 99999, vehicle: { ...s.vehicle, owned: ['engine-2'] } }, 'engine-2', 'engine', 0));
};
const upgraded = (): GameState => ok(buyHull(tuned(), 'hauler'));

test('buying a hull parks the old rig with its parts; the new one has basic gear', () => {
  const s = upgraded();
  expect(s.vehicle.hullId).toBe('hauler');
  expect(s.vehicle.fitted.engine).toEqual(['engine-1']);
  expect(s.vehicle.fitted.weapon).toEqual(['weapon-1', null]);
  expect(s.vehicle.owned).toEqual(['engine-1']);
  const old = s.garages.citadel!.vehicles[0];
  expect(old).toMatchObject({ kind: 'rig', tier: 1, hp: 60 });
  expect(old.rig?.fitted.engine).toEqual(['engine-2']);
  expect(escortStats(old)).toMatchObject({ name: 'OLD SCOUT', speed: 105, hp: 60, cargoCap: 60, tankCap: 40 });
});

test('in a city where you have no garage, the old rig is towed home', () => {
  const s = ok(buyHull(tuned(), 'hauler', CITY_BY_ID.ark));
  expect(s.garages.citadel?.vehicles).toHaveLength(1);
  expect(s.garages.ark).toBeUndefined();
});

test('you can switch back to the old rig, parking the new one', () => {
  const s = upgraded();
  const id = s.garages.citadel!.vehicles[0].id;
  const back = ok(driveRig(s, 'citadel', id));
  expect(back.vehicle).toMatchObject({ hullId: 'scout', hp: 60 });
  expect(back.vehicle.fitted.engine).toEqual(['engine-2']);
  expect(back.vehicle.owned).toEqual(s.vehicle.owned);
  expect(back.garages.citadel!.vehicles.map((v) => v.rig?.hullId)).toEqual(['hauler']);
});

test('you cannot switch to a rig that cannot lead your caravan', () => {
  let s = upgraded();
  for (let i = 0; i < 3; i++) s = ok(buyEscort(s, 'scout', 1));
  expect(driveRig(s, 'citadel', s.garages.citadel!.vehicles[0].id)).toEqual({ ok: false, reason: 'slot' });
});

test('the old rig can be sold from the garage, parts and all', () => {
  const s = upgraded();
  const sold = ok(sellStored(s, 'citadel', s.garages.citadel!.vehicles[0].id));
  // scout 250, engine-2 300, five starter parts at 25
  expect(sold.credits).toBe(s.credits + 250 + 300 + 5 * 25);
  expect(sold.garages.citadel!.vehicles).toEqual([]);
});

test('the old rig can join the caravan: it needs crew, then works as the rig it was', () => {
  let s = upgraded();
  const id = s.garages.citadel!.vehicles[0].id;
  s = ok(takeEscort(s, 'citadel', id));
  expect(seatsAt(s, id)).toBe(2);
  expect(caravanStats(s).idle).toBe(1);
  s = { ...s, crew: [{ id: 1, name: 'A B', role: 'driver', skill: 0, trait: 'grump', health: 100, face: 1, post: id, owed: 0, missed: 0 }] };
  expect(caravanStats(s).collectors).toEqual([{ id, radius: 8 }]);
  const unit = startBattle(s, []).units[1];
  expect(unit).toMatchObject({ name: 'OLD SCOUT', role: 'rig', maxHp: 60 });
  expect(unit.guns).toHaveLength(1);
  const hurt = { ...s, caravan: s.caravan.map((e) => ({ ...e, hp: 10 })) };
  expect(ok(repairEscorts(hurt)).caravan[0].hp).toBe(60);
  expect(ok(sellEscort(s, id)).credits).toBe(s.credits + 250 + 300 + 5 * 25);
  expect(ok(parkEscort(s, 'citadel', id)).garages.citadel!.vehicles).toHaveLength(1);
});

test('parts can be moved off the old rig, but not its only engine or tank', () => {
  let s = upgraded();
  const id = s.garages.citadel!.vehicles[0].id;
  s = ok(takeEscort(s, 'citadel', id));
  expect(unfitEscort(s, 'citadel', id, 'engine', 0)).toEqual({ ok: false, reason: 'required' });
  // swap the basic engine in to get the good one back
  const swapped = ok(fitEscort(s, 'citadel', id, 'engine', 'engine-1', 'aboard', 0));
  expect(swapped.vehicle.owned).toEqual(['engine-2']);
  expect(ok(unfitEscort(s, 'citadel', id, 'weapon', 0)).caravan[0].rig?.fitted.weapon).toEqual([null]);
});

test('a save from before rigs were kept gets its starting rig back, once', () => {
  const before = (hullId: 'scout' | 'hauler' | 'juggernaut') => {
    const s = JSON.parse(serialize(newGame(1)));
    s.version = 8;
    s.vehicle.hullId = hullId;
    return deserialize(JSON.stringify(s), '0.10.0-alpha')!;
  };
  for (const hull of ['hauler', 'juggernaut'] as const) {
    const s = before(hull);
    const [rig] = s.garages.citadel!.vehicles;
    expect(rig).toMatchObject({ id: 1, kind: 'rig', tier: 1, hp: 60 });
    expect(rig.rig).toMatchObject({ hullId: 'scout', fitted: { engine: ['engine-1'], weapon: ['weapon-1'] } });
    expect(s.nextEscortId).toBe(2);
    // loading the upgraded save again adds nothing
    expect(deserialize(serialize(s))).toEqual(s);
  }
  expect(before('scout').garages.citadel!.vehicles).toEqual([]);
});

const upgradedSave = (): string => {
  const s = JSON.parse(serialize(newGame(1)));
  s.version = 8;
  s.vehicle.hullId = 'hauler';
  return JSON.stringify(s);
};

test('the starting rig is only handed back by version 0.10.0', () => {
  for (const later of ['0.10.1-alpha', '0.11.0-alpha', '1.0.0']) {
    const s = deserialize(upgradedSave(), later)!;
    expect(s.garages.citadel!.vehicles).toEqual([]);
    expect(s.version).toBe(9);
  }
});

test('loading an older save stores the upgrade, so a rig given back stays given', () => {
  const store = new Map([[SAVE_KEY, upgradedSave()]]);
  const kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const first = loadGame(kv, '0.10.0-alpha')!;
  expect(first.garages.citadel!.vehicles).toHaveLength(1);
  expect(loadGame(kv, '0.11.0-alpha')).toEqual(first);
});

test('a parked rig is saved', () => {
  const s = upgraded();
  expect(deserialize(serialize(s))).toEqual(s);
  const bad = JSON.parse(serialize(s));
  delete bad.garages.citadel.vehicles[0].rig;
  expect(deserialize(JSON.stringify(bad))).toBeNull();
});
