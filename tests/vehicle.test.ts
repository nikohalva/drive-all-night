import { BALANCE } from '../src/config/balance';
import { HULLS, PARTS } from '../src/config/catalog';
import {
  addCargo,
  burnFuel,
  isBroken,
  starterVehicle,
  transferToTank,
  vehicleStats,
} from '../src/sim/vehicle';

test('starter vehicle stats', () => {
  const s = vehicleStats(starterVehicle());
  expect(s).toMatchObject({
    maxHp: 60,
    topSpeed: 80,
    tankCap: 40,
    cargoCap: 60,
    collectRadius: 8,
    armor: 1,
    strength: 8,
  });
  expect(s.weapons).toEqual([{ name: 'Pulse Gun', damage: 8, accuracy: 0.8 }]);
});

test('starter vehicle starts full, empty-handed and with one repair kit', () => {
  expect(starterVehicle()).toMatchObject({
    hullId: 'scout',
    hp: 60,
    fuel: 40,
    cargo: 0,
    repairKits: 1,
    owned: [],
  });
});

test('extra collectors widen the sweep', () => {
  const v = { ...starterVehicle(), hullId: 'hauler' as const };
  v.fitted = { ...v.fitted, collector: ['collector-2', 'collector-1'] };
  expect(vehicleStats(v).collectRadius).toBe(16);
});

test('cargo caps, transfer fills tank, fuel floors at 0', () => {
  let v = starterVehicle();
  const r = addCargo(v, 100);
  expect(r.added).toBe(60);
  v = r.v;
  v = { ...v, fuel: 30 };
  v = transferToTank(v);
  expect(v.fuel).toBe(40);
  expect(v.cargo).toBe(50);
  expect(burnFuel(v, 1, 10_000).fuel).toBe(0);
  expect(isBroken(burnFuel(v, 1, 10_000))).toBe(true);
});

test('burning fuel scales with throttle and hull tier, in either direction', () => {
  const v = starterVehicle();
  expect(burnFuel(v, 1, 10).fuel).toBeCloseTo(40 - BALANCE.FUEL_PER_SECOND * 10);
  expect(burnFuel(v, -0.5, 10).fuel).toBeCloseTo(40 - BALANCE.FUEL_PER_SECOND * 5);
  const big = { ...v, hullId: 'hauler' as const };
  expect(burnFuel(big, 1, 10).fuel).toBeCloseTo(40 - BALANCE.FUEL_PER_SECOND * 2 * 10);
});

test('starter keeps pace with the sun at about half throttle', () => {
  expect(vehicleStats(starterVehicle()).topSpeed * 0.5).toBeGreaterThanOrEqual(BALANCE.SUN_SPEED);
});

test('a vehicle with no hull points or no fuel is broken', () => {
  const v = starterVehicle();
  expect(isBroken(v)).toBe(false);
  expect(isBroken({ ...v, hp: 0 })).toBe(true);
  expect(isBroken({ ...v, fuel: 0 })).toBe(true);
});

test('catalog is complete: every hull slot type exists and parts match their slot', () => {
  expect(Object.keys(HULLS)).toEqual(['scout', 'hauler', 'juggernaut']);
  expect(HULLS.juggernaut.price).toBe(15000);
  expect(HULLS.hauler.slots.collector).toBe(2);
  for (const [id, part] of Object.entries(PARTS)) {
    expect(part.id).toBe(id);
    expect(id.startsWith(part.slot)).toBe(true);
  }
});
