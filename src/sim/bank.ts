/** The cities' shared bank. Banked credits cannot be taken from you on the road. */
import type { TxResult } from './economy';
import type { GameState } from './game-state';

function move(s: GameState, amount: number): TxResult {
  if (amount === 0) return { ok: false, reason: 'nothing' };
  return { ok: true, state: { ...s, credits: s.credits - amount, bank: s.bank + amount } };
}

export const deposit = (s: GameState, amount: number): TxResult => move(s, Math.max(0, Math.min(amount, s.credits)));
export const withdraw = (s: GameState, amount: number): TxResult => move(s, -Math.max(0, Math.min(amount, s.bank)) || 0);
