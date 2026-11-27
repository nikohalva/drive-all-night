/** What has to be settled when the caravan docks, before the city opens up. */
import { wagesDue } from './crew';
import type { GameState } from './game-state';

export type ArrivalStep = 'sell' | 'wages';

export function arrivalSteps(s: GameState): ArrivalStep[] {
  const steps: ArrivalStep[] = [];
  // cargo is sold for whole credits; less than one is nothing to ask about
  if (s.vehicle.cargo >= 1) steps.push('sell');
  if (wagesDue(s) > 0) steps.push('wages');
  return steps;
}
