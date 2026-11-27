/** The cities' shared bank. Banked credits cannot be taken from you on the road. */
import type { TxResult } from './economy';
import type { GameState } from './game-state';

function move(s: GameState, amount: number): TxResult {
  if (amount === 0) return { ok: false, reason: 'nothing' };
  return { ok: true, state: { ...s, credits: s.credits - amount, bank: s.bank + amount } };
}

export const deposit = (s: GameState, amount: number): TxResult => move(s, Math.max(0, Math.min(amount, s.credits)));
export const withdraw = (s: GameState, amount: number): TxResult => move(s, -Math.max(0, Math.min(amount, s.bank)) || 0);

/** Everything a city will take payment from. */
export const funds = (s: GameState): number => s.credits + s.bank;

/** The state as a city sees it when you shop: carried and banked credits in one purse. */
export const asOnePurse = (s: GameState): GameState => ({ ...s, credits: funds(s), bank: 0 });

/** Run a city transaction, paying from what you carry first and the rest from the bank. */
export function payInCity(s: GameState, tx: (purse: GameState) => TxResult): TxResult {
  const result = tx(asOnePurse(s));
  if (!result.ok) return result;
  const spent = funds(s) - result.state.credits;
  const fromHand = Math.min(spent, s.credits);
  return { ok: true, state: { ...result.state, credits: s.credits - fromHand, bank: s.bank - (spent - fromHand) } };
}
