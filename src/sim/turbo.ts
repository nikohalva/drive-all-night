import { BALANCE } from '../config/balance';

/** A short burst of speed that costs fuel and then has to recharge. */
export class Turbo {
  private burning = 0;
  private cooling = 0;

  /** True if it lit; the caller takes the fuel. */
  fire(fuel: number): boolean {
    if (this.cooling > 0 || fuel < BALANCE.TURBO_FUEL) return false;
    this.burning = BALANCE.TURBO_SECONDS;
    this.cooling = BALANCE.TURBO_RECHARGE;
    return true;
  }

  tick(dt: number): void {
    this.burning = Math.max(0, this.burning - dt);
    this.cooling = Math.max(0, this.cooling - dt);
  }

  /** Multiplier on top speed right now. */
  get boost(): number {
    return this.burning > 0 ? BALANCE.TURBO_BOOST : 1;
  }

  /** Seconds until it can fire again. */
  get waiting(): number {
    return this.cooling;
  }
}
