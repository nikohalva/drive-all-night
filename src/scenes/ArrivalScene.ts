import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { QUIT_AFTER } from '../config/crew';
import { CITY_BY_ID, START_CITY, type CityDef, type CityId } from '../config/cities';
import { VIEW } from '../config/view';
import { getState, setState } from '../game/session';
import { arrivalSteps, type ArrivalStep } from '../sim/arrival';
import { funds, payInCity } from '../sim/bank';
import { payWages, wagesDue } from '../sim/crew';
import { sellCargo } from '../sim/economy';

const W = VIEW.W;
const H = VIEW.H;

/**
 * Shown on docking: sell your Particle X and settle the crew's wages, one decision at a time,
 * before the city menu opens.
 */
export class ArrivalScene extends Phaser.Scene {
  private city: CityDef = CITY_BY_ID[START_CITY];
  private steps: ArrivalStep[] = [];
  private choice = 0;
  private note = '';
  private canvas!: Phaser.Textures.CanvasTexture;

  constructor() {
    super('arrival');
  }

  init(data: { cityId?: CityId | null }): void {
    this.city = CITY_BY_ID[data.cityId ?? START_CITY] ?? CITY_BY_ID[START_CITY];
  }

  create(): void {
    this.steps = arrivalSteps(getState());
    this.choice = 0;
    this.note = '';
    if (this.steps.length === 0) {
      this.enter();
      return;
    }
    if (this.textures.exists('arrival-ui')) this.textures.remove('arrival-ui');
    this.canvas = this.textures.createCanvas('arrival-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'arrival-ui').setOrigin(0, 0);

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    for (const key of ['UP', 'W', 'DOWN', 'S']) kb?.on(`keydown-${key}`, () => this.toggle());
    // no Esc: nothing here should be skipped by accident
    for (const key of ['ENTER', 'SPACE']) kb?.on(`keydown-${key}`, (e: KeyboardEvent) => !e.repeat && this.confirm());
    this.events.once('shutdown', () => kb?.removeAllListeners());
    this.render();
  }

  private toggle(): void {
    this.choice = 1 - this.choice;
    this.render();
  }

  private confirm(): void {
    const s = getState();
    const step = this.steps[0];
    this.note = '';
    if (this.choice === 0 && step === 'sell') {
      const value = Math.floor(s.vehicle.cargo * this.city.sellPrice);
      const r = sellCargo(s, this.city);
      if (r.ok) {
        setState(r.state);
        this.note = `SOLD FOR ${value} CR`;
      }
    } else if (this.choice === 0 && step === 'wages') {
      const r = payInCity(s, payWages);
      if (!r.ok) {
        this.note = 'YOU CANNOT AFFORD ANYONE. CHOOSE NOT TO PAY, OR SELL SOMETHING FIRST';
        this.choice = 1;
        this.render();
        return;
      }
      setState(r.state);
      const left = wagesDue(r.state);
      this.note = left > 0 ? `PAID WHAT YOU COULD. ${left} CR STILL OWED` : 'THE CREW IS PAID';
    }
    this.steps.shift();
    this.choice = 0;
    if (this.steps.length === 0) this.enter();
    else this.render();
  }

  private enter(): void {
    this.scene.launch('city', { cityId: this.city.id });
    this.scene.stop();
  }

  private render(): void {
    const s = getState();
    const ctx = this.canvas.getContext();
    ctx.fillStyle = '#07030c';
    ctx.fillRect(0, 0, W, H);
    const centred = (str: string, y: number, color: string, scale = 1): void => {
      ctx.save();
      ctx.translate(Math.round((W - textWidth(str) * scale) / 2), y);
      ctx.scale(scale, scale);
      drawText(ctx, str, 0, 0, color, scale > 1 ? `${color}55` : undefined);
      ctx.restore();
    };
    const option = (index: number, label: string, y: number): void => {
      const selected = this.choice === index;
      if (selected) {
        ctx.fillStyle = 'rgba(255,43,214,0.3)';
        ctx.fillRect(W / 2 - 130, y - 6, 260, 17);
      }
      centred(selected ? `> ${label} <` : label, y, selected ? PAL.white : '#8a7aaa');
    };

    centred(`WELCOME TO ${this.city.name}`, 30, this.city.color, 3);
    centred(`CREDITS ${Math.floor(s.credits)}   BANK ${Math.floor(s.bank)}`, 62, PAL.amber);
    if (this.note) centred(this.note, 76, PAL.cyanPale);

    if (this.steps[0] === 'sell') {
      const value = Math.floor(s.vehicle.cargo * this.city.sellPrice);
      centred('YOUR PARTICLE X', 104, PAL.pink, 2);
      centred(`${s.vehicle.cargo.toFixed(1)} X AT ${this.city.sellPrice} CR EACH`, 128, PAL.white);
      if (s.debt > 0) centred(`DEBT ${Math.floor(s.debt)} CR IS PAID FIRST`, 140, PAL.red);
      option(0, `SELL IT ALL FOR ${value} CR`, 180);
      option(1, 'KEEP IT', 202);
    } else {
      centred('PAYDAY', 104, PAL.pink, 2);
      const owed = s.crew.filter((m) => Math.floor(m.owed) > 0);
      owed.slice(0, 10).forEach((m, i) => {
        const warn = m.missed + 1 >= QUIT_AFTER;
        centred(`${m.name}  ${Math.floor(m.owed)} CR${warn ? '  QUITS IF UNPAID' : ''}`, 126 + i * 9, warn ? PAL.red : PAL.white);
      });
      if (owed.length > 10) centred(`AND ${owed.length - 10} MORE`, 216, '#8a7aaa');
      option(0, `PAY THE CREW ${wagesDue(s)} CR`, 238);
      option(1, "DON'T PAY", 260);
      centred('UNPAID CREW GIVE NO BONUS. TWICE IN A ROW AND THEY QUIT', 284, PAL.amber);
      if (funds(s) < wagesDue(s)) centred('YOU CANNOT PAY EVERYONE: THE LONGEST UNPAID COME FIRST', 296, PAL.red);
    }
    centred('UP/DOWN: CHOOSE   ENTER: CONFIRM', H - 16, '#6a5a8a');
    this.canvas.refresh();
  }
}
