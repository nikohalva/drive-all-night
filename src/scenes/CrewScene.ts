import Phaser from 'phaser';
import { drawText, textWidth } from '../art/font';
import { PAL } from '../art/palette';
import { PORTRAIT, portrait } from '../art/portraits';
import { ROLE_EFFECT, ROLE_NAME, SKILL_NAME, TRAITS } from '../config/crew';
import { escortDef } from '../config/escorts';
import { VIEW } from '../config/view';
import { getState, setState } from '../game/session';
import { assignCrew, crewAt, dismissCrew, isFit, reassignCrew, seatCandidate, seatsAt, type CrewMember, type Post } from '../sim/crew';
import type { GameState } from '../sim/game-state';

const W = VIEW.W;
const H = VIEW.H;
const LIST_W = 440;
const SIDE_X = LIST_W + 12;
const ROW_H = 11;
const VISIBLE = 24;

export const healthWord = (m: CrewMember): string =>
  m.health >= 100 ? 'FIT' : isFit(m) ? `HURT ${Math.floor(m.health)}%` : `DOWN ${Math.floor(m.health)}%`;

type Row =
  | { heading: string; warn: boolean }
  | { captain: true }
  | { member: CrewMember }
  /** A vehicle's free seats: pick it to bring someone in. */
  | { empty: Post };

/** The crew roster, by vehicle. Opened with C on the road or from a city; the clock is stopped. */
export class CrewScene extends Phaser.Scene {
  private from: 'drive' | 'city' = 'drive';
  private cursor = 0;
  private canvas!: Phaser.Textures.CanvasTexture;
  /** Crew id waiting for a second X to confirm dismissal. */
  private pending: number | null = null;
  private message = '';

  constructor() {
    super('crew');
  }

  init(data: { from?: 'drive' | 'city' }): void {
    this.from = data.from ?? 'drive';
  }

  create(): void {
    this.cursor = 0;
    this.pending = null;
    this.message = '';
    if (this.textures.exists('crew-ui')) this.textures.remove('crew-ui');
    this.canvas = this.textures.createCanvas('crew-ui', W, H) as Phaser.Textures.CanvasTexture;
    this.add.image(0, 0, 'crew-ui').setOrigin(0, 0);

    const kb = this.input.keyboard;
    kb?.removeAllListeners();
    for (const key of ['UP', 'W']) kb?.on(`keydown-${key}`, () => this.move(-1));
    for (const key of ['DOWN', 'S']) kb?.on(`keydown-${key}`, () => this.move(1));
    for (const key of ['ENTER', 'SPACE']) kb?.on(`keydown-${key}`, () => this.reassign());
    for (const key of ['C', 'ESC']) kb?.on(`keydown-${key}`, () => this.close());
    kb?.on('keydown-X', () => this.dismiss());
    kb?.on('keydown-R', () => this.unseat());
    this.events.once('shutdown', () => kb?.removeAllListeners());
    this.render();
  }

  private rows(s: GameState): Row[] {
    const rows: Row[] = [];
    const group = (post: Post, title: string): void => {
      const people = crewAt(s, post);
      const idle = typeof post === 'number' && !people.some(isFit);
      const count = `${people.length}/${seatsAt(s, post)}`;
      rows.push({ heading: `${title}  ${count}${idle ? '  NOBODY FIT: IDLE' : ''}`, warn: idle });
      if (post === 'lead') rows.push({ captain: true });
      for (const member of people) rows.push({ member });
      if (post !== null && people.length < seatsAt(s, post)) rows.push({ empty: post });
    };
    group('lead', 'YOUR RIG');
    for (const e of s.caravan) group(e.id, escortDef(e.kind, e.tier).name);
    group(null, 'RESERVE');
    return rows;
  }

  /** Rows that can be selected: the captain, every hired hand and free seats. */
  private people(rows: Row[]): Row[] {
    return rows.filter((r) => !('heading' in r));
  }

  private selected(): CrewMember | null {
    const row = this.people(this.rows(getState()))[this.cursor];
    return row && 'member' in row ? row.member : null;
  }

  private move(step: number): void {
    const n = this.people(this.rows(getState())).length;
    this.cursor = (this.cursor + step + n) % n;
    this.pending = null;
    this.message = '';
    this.render();
  }

  /** Keep the cursor on the same person after they change vehicles. */
  private follow(id: number): void {
    const at = this.people(this.rows(getState())).findIndex((r) => 'member' in r && r.member.id === id);
    if (at >= 0) this.cursor = at;
  }

  private fill(post: Post): void {
    const s = getState();
    const who = seatCandidate(s, post);
    if (!who) {
      this.message = 'NOBODY TO SPARE. HIRE CREW IN A CITY';
      return;
    }
    const r = assignCrew(s, who.id, post);
    if (r.ok) {
      setState(r.state);
      this.follow(who.id);
      this.message = '';
    }
  }

  private reassign(): void {
    const row = this.people(this.rows(getState()))[this.cursor];
    if (row && 'empty' in row) {
      this.pending = null;
      this.fill(row.empty);
      this.render();
      return;
    }
    const m = this.selected();
    if (!m) return;
    this.pending = null;
    const r = reassignCrew(getState(), m.id);
    if (r.ok) {
      setState(r.state);
      this.follow(m.id);
      this.message = '';
    } else {
      this.message = 'NO FREE SEAT ANYWHERE ELSE';
    }
    this.render();
  }

  /** Take someone off their vehicle without letting them go. */
  private unseat(): void {
    const m = this.selected();
    if (!m) return;
    this.pending = null;
    if (m.post === null) {
      this.message = `${m.name} IS ALREADY IN THE RESERVE`;
    } else {
      const r = assignCrew(getState(), m.id, null);
      if (r.ok) {
        setState(r.state);
        this.follow(m.id);
        this.message = '';
      } else {
        this.message = 'THE RESERVE IS FULL. X REMOVES SOMEONE FROM THE CREW';
      }
    }
    this.render();
  }

  private dismiss(): void {
    const m = this.selected();
    if (!m) return;
    if (this.pending !== m.id) {
      this.pending = m.id;
      this.message = `PRESS X AGAIN TO DISMISS ${m.name}`;
    } else {
      const r = dismissCrew(getState(), m.id);
      if (r.ok) setState(r.state);
      this.pending = null;
      this.message = `${m.name} IS GONE`;
      this.cursor = Math.min(this.cursor, this.people(this.rows(getState())).length - 1);
    }
    this.render();
  }

  private close(): void {
    this.scene.stop();
    this.scene.get(this.from).events.emit('crew-done');
  }

  private render(): void {
    const s = getState();
    const ctx = this.canvas.getContext();
    ctx.fillStyle = '#07030c';
    ctx.fillRect(0, 0, W, H);
    const text = (str: string, x: number, y: number, color: string, scale = 1): void => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      drawText(ctx, str, 0, 0, color, scale > 1 ? `${color}55` : undefined);
      ctx.restore();
    };

    text('CREW', 8, 8, PAL.pink, 2);
    text('UP/DOWN: PICK  ENTER: MOVE/FILL  R: OFF VEHICLE  X: FIRE  C: CLOSE', 60, 11, '#8a7aaa');

    const rows = this.rows(s);
    const chosen = this.people(rows)[this.cursor];
    const at = rows.indexOf(chosen);
    const start = Math.max(0, Math.min(at - 10, rows.length - VISIBLE));
    rows.slice(start, start + VISIBLE).forEach((row, i) => {
      const y = 30 + i * ROW_H;
      if (row === chosen) {
        ctx.fillStyle = 'rgba(255,43,214,0.22)';
        ctx.fillRect(6, y - 3, LIST_W - 4, ROW_H);
      }
      if ('heading' in row) {
        text(row.heading, 8, y, row.warn ? PAL.red : PAL.amber);
      } else if ('empty' in row) {
        text('+ EMPTY SEAT', 20, y, '#7a6a9a');
      } else if ('captain' in row) {
        text('YOU', 20, y, PAL.cyan);
        text('ROAD CAPTAIN', 130, y, PAL.cyan);
      } else {
        const m = row.member;
        const color = !isFit(m) ? PAL.red : m.health < 100 ? PAL.amber : PAL.white;
        text(m.name, 20, y, color);
        text(ROLE_NAME[m.role], 130, y, color);
        text(SKILL_NAME[m.skill], 200, y, color);
        text(TRAITS[m.trait].name, 270, y, '#b8a8d8');
        text(healthWord(m), 340, y, color);
      }
    });

    // the selected person, with their picture
    const scale = 5;
    const size = PORTRAIT * scale;
    const px = SIDE_X + Math.floor((W - SIDE_X - 6 - size) / 2);
    ctx.fillStyle = PAL.pink;
    ctx.fillRect(px - 2, 28, size + 4, size + 4);
    const member = chosen && 'member' in chosen ? chosen.member : null;
    if (member) ctx.drawImage(portrait(member.face, member.role), px, 30, size, size);
    else if (chosen && 'captain' in chosen) ctx.drawImage(portrait(s.seed, 'captain'), px, 30, size, size);
    else {
      ctx.fillStyle = '#140726';
      ctx.fillRect(px, 30, size, size);
    }
    let y = 38 + size;
    const line = (str: string, color: string): void => {
      text(str, SIDE_X, y, color);
      y += 10;
    };
    if (member) {
      line(member.name, PAL.white);
      line(`${SKILL_NAME[member.skill]} ${ROLE_NAME[member.role]}`, PAL.cyanPale);
      line(healthWord(member), isFit(member) ? PAL.white : PAL.red);
      line(TRAITS[member.trait].name, PAL.amber);
      for (const part of wrap(TRAITS[member.trait].line, W - SIDE_X - 6)) line(part, '#b8a8d8');
      y += 4;
      const effect = member.skill === 0 ? 'KEEPS THE VEHICLE ROLLING. NO BONUS' : ROLE_EFFECT[member.role];
      for (const part of wrap(effect, W - SIDE_X - 6)) line(part, '#8a7aaa');
      y += 8;
      line('ENTER: MOVE ELSEWHERE', PAL.cyanPale);
      if (member.post !== null) line('R: TAKE OFF THE VEHICLE', PAL.cyanPale);
      line('X TWICE: REMOVE FROM CREW', PAL.red);
    } else if (chosen && 'empty' in chosen) {
      const who = seatCandidate(s, chosen.empty);
      line('EMPTY SEAT', PAL.white);
      const hint = who ? `ENTER: BRING ${who.name} HERE` : 'NOBODY TO SPARE. HIRE CREW IN A CITY';
      for (const part of wrap(hint, W - SIDE_X - 6)) line(part, PAL.amber);
    } else {
      line('YOU', PAL.white);
      line('ROAD CAPTAIN', PAL.cyan);
      for (const part of wrap('LEADS THE CARAVAN. ALWAYS ABOARD', W - SIDE_X - 6)) line(part, '#8a7aaa');
    }

    if (this.message) text(this.message, Math.round((W - textWidth(this.message)) / 2), H - 12, PAL.red);
    this.canvas.refresh();
  }
}

/** Break text into lines no wider than `width` px. */
export function wrap(str: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of str.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && textWidth(`${last} ${word}`) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}
