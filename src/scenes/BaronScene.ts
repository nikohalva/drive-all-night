import { sound } from '../audio/engine';
import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { PARTS } from '../config/catalog';
import { VIEW } from '../config/view';
import { getState, setState } from '../game/session';
import {
  STANDING_COLOR,
  TRIBUTE,
  baronPrice,
  baronStock,
  buyFromBaron,
  mineById,
  relation,
  statusOf,
  swearAlliance,
  tributeCredits,
  tributeX,
  type Mine,
} from '../sim/barons';
import type { TxResult } from '../sim/economy';
import { hash2 } from '../sim/rng';
import { saveGame } from '../sim/save';
import { nearestCopy } from '../sim/world';

const W = VIEW.W;
const H = VIEW.H;
const TABS = ['STANDING', 'TRIBUTE', 'TRADE', 'ALLIANCE', 'SAVE', 'LEAVE'] as const;
type Tab = (typeof TABS)[number];
const ROW_H = 11;
const LIST_Y = 56;

const TEMPER_LINE: Record<Mine['temper'], string> = {
  warlike: 'A WARLORD. THEIR CRAWLERS HUNT THE NIGHT AROUND THIS MINE.',
  wary: 'CAREFUL AND PROUD. TRUST IS EARNED SLOWLY HERE.',
  trader: 'A DEALER AT HEART. GOOD COIN OPENS EVERY DOOR.',
};

const REASONS: Record<string, string> = {
  credits: 'NOT ENOUGH CREDITS',
  nothing: 'NOTHING TO GIVE',
  refused: 'THE BARON REFUSES',
  slot: 'NO ROOM FOR MORE SPARES',
};

interface Row {
  text: string;
  right?: string;
  color: string;
  dim?: boolean;
  detail?: string;
}

/** A night baron's hall, deep in the mine: standing, tribute, clan trade and alliances. */
export class BaronScene extends Phaser.Scene {
  private mine!: Mine;
  private tab = 0;
  private cursor = 0;
  private message = { text: '', good: true };
  private canvas!: Phaser.Textures.CanvasTexture;
  private lastSig = '';

  constructor() {
    super('baron');
  }

  init(data: { mineId?: string | null }): void {
    const s = getState();
    const m = mineById(s.seed, data.mineId ?? '');
    if (m) this.mine = m;
  }

  create(): void {
    this.tab = 0;
    this.cursor = 0;
    this.lastSig = '';
    const status = statusOf(relation(getState(), this.mine));
    this.message = {
      text: status === 'HOSTILE' ? 'THE CLAN GLARES AT YOU. TRIBUTE MIGHT COOL THEIR TEMPER.' : `THE ${this.mine.clan} LET YOU IN.`,
      good: status !== 'HOSTILE',
    };
    this.drawBackground();
    if (this.textures.exists('baron-ui')) this.textures.remove('baron-ui');
    this.canvas = this.textures.createCanvas('baron-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'baron-ui').setOrigin(0, 0).setDepth(20);

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    for (const key of ['LEFT', 'A']) kb?.on(`keydown-${key}`, () => this.moveTab(-1));
    for (const key of ['RIGHT', 'D']) kb?.on(`keydown-${key}`, () => this.moveTab(1));
    for (const key of ['UP', 'W']) kb?.on(`keydown-${key}`, () => this.moveRow(-1));
    for (const key of ['DOWN', 'S']) kb?.on(`keydown-${key}`, () => this.moveRow(1));
    for (const key of ['ENTER', 'SPACE']) kb?.on(`keydown-${key}`, () => this.choose());
    kb?.on('keydown-ESC', () => this.leave());
    this.events.once('shutdown', () => kb?.removeAllListeners());
  }

  update(): void {
    this.redraw();
  }

  private current(): Tab {
    return TABS[this.tab];
  }

  private moveTab(step: number): void {
    this.tab = (this.tab + step + TABS.length) % TABS.length;
    this.cursor = 0;
  }

  private moveRow(step: number): void {
    const n = this.rows().length;
    if (n > 0) this.cursor = (this.cursor + step + n) % n;
  }

  private apply(r: TxResult, done: string): void {
    sound.play(r.ok ? 'coin' : 'deny');
    if (r.ok) {
      setState(r.state);
      this.message = { text: done, good: true };
    } else {
      this.message = { text: REASONS[r.reason] ?? 'NOT POSSIBLE', good: false };
    }
  }

  private choose(): void {
    const s = getState();
    const id = this.mine.id;
    switch (this.current()) {
      case 'TRIBUTE':
        if (this.cursor === 0) this.apply(tributeX(s, id), `${this.mine.baron} ACCEPTS THE PARTICLE X`);
        else this.apply(tributeCredits(s, id), `${this.mine.baron} POCKETS THE CREDITS`);
        break;
      case 'TRADE': {
        const part = baronStock(this.mine)[this.cursor];
        if (part) this.apply(buyFromBaron(s, id, part), `BOUGHT ${PARTS[part].name.toUpperCase()} (FIT IT IN A CITY GARAGE)`);
        break;
      }
      case 'ALLIANCE':
        this.apply(swearAlliance(s, id), `YOU ARE NOW SWORN TO THE ${this.mine.clan}`);
        break;
      case 'SAVE':
        if (!relation(s, this.mine).allied) this.message = { text: 'ONLY ALLIES MAY REST IN THIS HALL', good: false };
        else if (saveGame(s)) this.message = { text: 'GAME SAVED', good: true };
        else this.message = { text: 'COULD NOT SAVE', good: false };
        break;
      case 'LEAVE':
        this.leave();
        break;
      default:
        break;
    }
  }

  private leave(): void {
    const s = getState();
    setState({
      ...s,
      player: { x: this.mine.exitX, y: nearestCopy(this.mine.exitY, s.player.y), heading: -Math.PI / 2 },
    });
    this.scene.stop();
    this.scene.get('drive').events.emit('baron-done');
  }

  private rows(): Row[] {
    const s = getState();
    const r = relation(s, this.mine);
    const status = statusOf(r);
    switch (this.current()) {
      case 'STANDING':
        return [
          { text: `${this.mine.baron} OF THE ${this.mine.clan}`, color: PAL.white },
          { text: `STANDING ${r.standing}  ${status}`, color: STANDING_COLOR[status] },
          { text: TEMPER_LINE[this.mine.temper], color: '#c8b8e8' },
          {
            text:
              status === 'HOSTILE'
                ? 'THEIR WAR PARTIES WILL HUNT YOU NEAR THIS MINE.'
                : status === 'WARY'
                  ? 'THEY WILL NOT TRADE WITH YOU YET.'
                  : status === 'NEUTRAL'
                    ? 'THEY WILL TRADE, AT A PRICE.'
                    : status === 'FRIENDLY'
                      ? 'THEY WOULD HEAR AN OATH OF ALLIANCE.'
                      : 'SWORN ALLIES: CHEAPER TRADE, A SAFE HALL, RIDERS IN YOUR BATTLES.',
            color: PAL.amber,
          },
        ];
      case 'TRIBUTE':
        return [
          {
            text: `GIVE ${TRIBUTE.x} PARTICLE X`,
            right: `+${TRIBUTE.xGain} STANDING`,
            color: PAL.cyanPale,
            dim: s.vehicle.cargo < TRIBUTE.x,
            detail: `YOU CARRY ${s.vehicle.cargo.toFixed(0)} X`,
          },
          {
            text: `GIVE ${TRIBUTE.credits} CR`,
            right: `+${TRIBUTE.creditsGain} STANDING`,
            color: PAL.amber,
            dim: s.credits < TRIBUTE.credits,
          },
        ];
      case 'TRADE': {
        const refused = status === 'HOSTILE' || status === 'WARY';
        return baronStock(this.mine).map((id) => {
          const part = PARTS[id];
          const price = baronPrice(part.price, r);
          return {
            text: part.name.toUpperCase(),
            right: `${price} CR`,
            color: PAL.amber,
            dim: refused || s.credits < price,
            detail: refused ? 'THEY WILL NOT TRADE UNTIL YOU ARE AT LEAST NEUTRAL' : `CLAN-MADE ${part.slot.toUpperCase()} MK${part.tier}`,
          };
        });
      }
      case 'ALLIANCE':
        return r.allied
          ? [{ text: `SWORN TO THE ${this.mine.clan}`, color: PAL.cyan, detail: '20% OFF TRADE. SAVE IN THIS HALL. CLAN RIDERS MAY JOIN YOUR BATTLES NEARBY.' }]
          : [
              {
                text: 'SWEAR AN ALLIANCE',
                right: `${TRIBUTE.alliance} CR`,
                color: PAL.cyan,
                dim: status !== 'FRIENDLY' || s.credits < TRIBUTE.alliance,
                detail: status === 'FRIENDLY' ? 'AN OATH-GIFT SEALS IT' : 'THE BARON MUST BE FRIENDLY FIRST (STANDING 40+)',
              },
            ];
      case 'SAVE':
        return [{ text: 'SAVE GAME', color: r.allied ? PAL.cyan : '#5a4a7a', detail: r.allied ? 'YOUR ALLIES KEEP WATCH' : 'ONLY ALLIES MAY REST HERE' }];
      case 'LEAVE':
        return [{ text: 'BACK TO THE SURFACE', color: PAL.white, detail: 'ESC ALSO LEAVES' }];
    }
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(0x0a0512, 1);
    g.fillRect(0, 0, W, H);
    // rough tunnel walls with lantern light
    for (let y = 0; y < H; y += 4) {
      for (let x = 0; x < W; x += 4) {
        const h = hash2(77, x, y);
        if (h < 0.18) {
          g.fillStyle(h < 0.05 ? 0x2a1a3a : 0x1a0f26, 1);
          g.fillRect(x, y, 4, 4);
        }
      }
    }
    for (const x of [40, W - 40]) {
      g.fillStyle(0xffd23f, 1);
      g.fillRect(x - 1, 60, 3, 4);
      g.fillStyle(0xc050ff, 0.12);
      g.fillCircle(x, 62, 40);
    }
  }

  private redraw(): void {
    const s = getState();
    const sig = JSON.stringify({ t: this.tab, c: this.cursor, m: this.message, cr: s.credits, x: s.vehicle.cargo, b: s.barons[this.mine.id] });
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    const ctx = this.canvas.getContext();
    ctx.clearRect(0, 0, W, H);
    this.drawUi(ctx, s);
    this.canvas.refresh();
  }

  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawText(ctx, s, 0, 0, color, scale > 1 ? `${color}55` : undefined);
    ctx.restore();
  }

  private drawUi(ctx: CanvasRenderingContext2D, s: ReturnType<typeof getState>): void {
    const status = statusOf(relation(s, this.mine));
    ctx.fillStyle = 'rgba(7,3,12,0.85)';
    ctx.fillRect(0, 0, W, 24);
    this.text(ctx, `HALL OF ${this.mine.baron}`, 6, 5, '#c050ff', 2);
    const cr = `CR ${Math.floor(s.credits)}`;
    this.text(ctx, cr, W - textWidth(cr) * 2 - 8, 5, PAL.amber, 2);
    this.text(ctx, status, W - textWidth(status) - 8, 16, STANDING_COLOR[status]);

    let x = 6;
    TABS.forEach((name, i) => {
      const w = textWidth(name) + 12;
      if (i === this.tab) {
        ctx.fillStyle = 'rgba(192,80,255,0.35)';
        ctx.fillRect(x, 28, w, 13);
      }
      this.text(ctx, name, x + 6, 32, i === this.tab ? PAL.white : '#8a7aaa');
      x += w + 4;
    });

    ctx.fillStyle = 'rgba(7,3,12,0.8)';
    ctx.fillRect(6, LIST_Y - 4, W - 12, 14 * ROW_H);
    const rows = this.rows();
    const cursor = Math.min(this.cursor, Math.max(0, rows.length - 1));
    rows.forEach((row, i) => {
      const y = LIST_Y + i * ROW_H;
      const selectable = this.current() !== 'STANDING';
      if (selectable && i === cursor) {
        ctx.fillStyle = 'rgba(192,80,255,0.22)';
        ctx.fillRect(8, y - 2, W - 16, ROW_H);
        this.text(ctx, '>', 11, y, PAL.amber);
      }
      const color = row.dim ? '#5a4a7a' : row.color;
      this.text(ctx, row.text, 20, y, color);
      if (row.right) this.text(ctx, row.right, W - textWidth(row.right) - 14, y, color);
    });
    const detail = rows[cursor]?.detail;
    if (detail) this.text(ctx, detail, 10, LIST_Y + 14 * ROW_H + 2, PAL.cyanPale);

    ctx.fillStyle = 'rgba(7,3,12,0.85)';
    ctx.fillRect(0, H - 14, W, 14);
    this.text(ctx, this.message.text, 6, H - 10, this.message.good ? PAL.cyanPale : PAL.red);
  }
}
