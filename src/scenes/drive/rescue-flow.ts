import Phaser from 'phaser';
import { getState, setState, ui, type DestroyReason } from '../../game/session';
import { applyRescue, describeRescue, rollRescue, type RescueOutcome } from '../../sim/rescue';
import type { GameState } from '../../sim/game-state';
import type { Rng } from '../../sim/rng';
import { secondsUntilDawn, zoneAt } from '../../sim/world';

/** How long the "call sent" overlay runs while the planet clock races through the wait. */
const CALL_MS = 2000;
const RESULT_MS = 2400;

export interface RescueHooks {
  freeze(frozen: boolean): void;
  destroyed(reason: DestroyReason): void;
}

/** A broken-down rig sends a distress call: wait, then see who answers. */
export class RescueFlow {
  active = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rng: Rng,
    private readonly hooks: RescueHooks,
  ) {}

  begin(): void {
    if (this.active) return;
    const before = getState();
    const zone = zoneAt(before.player.y, before.t);
    const outcome = rollRescue(
      this.rng,
      zone,
      secondsUntilDawn(before.player.y, before.t),
      before.flags.firstRescueUsed,
    );

    this.active = true;
    this.hooks.freeze(true);
    ui.message = 'DISTRESS CALL SENT...';

    // the sun keeps moving while you wait; show it racing ahead
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: CALL_MS,
      onUpdate: (tween) => setState({ ...getState(), t: before.t + outcome.waitSeconds * (tween.getValue() ?? 0) }),
      onComplete: () => this.resolve(before, outcome, zone === 'scorch' ? 'heat' : 'dawn'),
    });
  }

  private resolve(before: GameState, outcome: RescueOutcome, reason: DestroyReason): void {
    setState(before); // undo the preview, then apply the outcome properly
    if (outcome.type === 'destroyed') {
      this.active = false;
      ui.message = null;
      this.hooks.destroyed(reason);
      return;
    }
    const after = applyRescue(before, outcome);
    setState(after);
    ui.message = describeRescue(outcome, before, after);
    this.scene.time.delayedCall(RESULT_MS, () => {
      ui.message = null;
      this.active = false;
      this.hooks.freeze(false);
    });
  }
}
