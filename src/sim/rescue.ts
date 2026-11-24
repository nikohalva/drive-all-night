import { BALANCE } from '../config/balance';
import type { GameState } from './game-state';
import type { Rng } from './rng';
import { vehicleStats } from './vehicle';
import type { Zone } from './world';

export type RescueOutcome =
  | { type: 'rescued'; waitSeconds: number; fee: number }
  | { type: 'pirates'; waitSeconds: number }
  | { type: 'destroyed'; waitSeconds: number };

type RescueZone = 'sunset' | 'deep' | 'predawn' | 'scorch';

/** Who answers a distress call depends on where you are. Waits are world seconds. */
export const RESCUE_TABLE: Record<
  RescueZone,
  { pirateChance: number; waitMin: number; waitMax: number; fee: number }
> = {
  sunset: { pirateChance: 0.3, waitMin: 20, waitMax: 60, fee: 150 },
  deep: { pirateChance: 0, waitMin: 120, waitMax: 600, fee: 300 },
  predawn: { pirateChance: 0, waitMin: 300, waitMax: 900, fee: 500 },
  scorch: { pirateChance: 0, waitMin: 10, waitMax: 30, fee: 400 },
};

const FIRST_RESCUE_WAIT = 15;

export function rollRescue(
  rng: Rng,
  zone: Zone,
  secondsUntilDawn: number,
  firstRescueUsed: boolean,
): RescueOutcome {
  if (zone === 'dawn') return { type: 'destroyed', waitSeconds: 0 };
  if (!firstRescueUsed) return { type: 'rescued', waitSeconds: FIRST_RESCUE_WAIT, fee: 0 };

  const row = RESCUE_TABLE[zone];
  const waitSeconds = (): number => row.waitMin + rng() * (row.waitMax - row.waitMin);

  if (rng() < row.pirateChance) return { type: 'pirates', waitSeconds: waitSeconds() };

  const wait = waitSeconds();
  const tooSlow = wait >= secondsUntilDawn || (zone === 'scorch' && wait > BALANCE.SCORCH_SURVIVE_SECONDS);
  return tooSlow ? { type: 'destroyed', waitSeconds: wait } : { type: 'rescued', waitSeconds: wait, fee: row.fee };
}

/** Fold a rescue outcome into the game state. A destroyed vehicle is the caller's to reload. */
export function applyRescue(s: GameState, o: RescueOutcome): GameState {
  const timed: GameState = { ...s, t: s.t + o.waitSeconds };
  switch (o.type) {
    case 'rescued': {
      const maxHp = vehicleStats(s.vehicle).maxHp;
      const paid = Math.min(s.credits, o.fee);
      return {
        ...timed,
        credits: s.credits - paid,
        debt: s.debt + (o.fee - paid),
        vehicle: {
          ...s.vehicle,
          hp: Math.max(s.vehicle.hp, Math.ceil(0.25 * maxHp)),
          fuel: Math.max(s.vehicle.fuel, BALANCE.RESCUE_FUEL),
        },
        flags: { ...s.flags, firstRescueUsed: true },
      };
    }
    case 'pirates':
      return { ...timed, vehicle: { ...s.vehicle, cargo: 0 } };
    case 'destroyed':
      return timed;
  }
}

/** One line telling the player how their distress call went. */
export function describeRescue(o: RescueOutcome, before: GameState, after: GameState): string {
  switch (o.type) {
    case 'rescued': {
      if (o.fee === 0) return 'A COLLECTOR CREW PATCHED YOU UP. THIS CALL WAS FREE';
      const added = Math.round(after.debt - before.debt);
      const fee = `A COLLECTOR CREW PATCHED YOU UP. FEE ${o.fee} CR`;
      return added > 0 ? `${fee}. ${added} CR ADDED TO DEBT` : fee;
    }
    case 'pirates':
      return 'PIRATES ANSWERED YOUR CALL. THEY TOOK YOUR CARGO';
    case 'destroyed':
      return 'NO ONE CAME IN TIME';
  }
}
