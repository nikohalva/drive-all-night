import Phaser from 'phaser';
import { CITY_DOCK_Y, CITY_H, CITY_W, rigLayout, rigSignature } from '../art/painters';
import { ensureCityTexture, ensureRigTextures } from '../art/textures';
import { BALANCE } from '../config/balance';
import {
  getDepletion,
  getState,
  hooks,
  resetDepletion,
  setState,
  ui,
  type DestroyReason,
} from '../game/session';
import { advance } from '../sim/clock';
import { forwardSpeed, stepDriving, type DriveEnv, type Kinematics } from '../sim/driving';
import { newGame } from '../sim/game-state';
import { collect } from '../sim/particles';
import type { PirateGroup } from '../sim/pirate-fleet';
import { Grace } from '../sim/pirates';
import { makeRng, randomSeed } from '../sim/rng';
import { loadGame } from '../sim/save';
import { TERRAIN_SPEED, terrainAt } from '../sim/terrain';
import { addCargo, burnFuel, isBroken, transferToTank, vehicleStats } from '../sim/vehicle';
import {
  cityPosition,
  heatDps,
  nearestCopy,
  scorchDepth,
  secondsUntilDawn,
  zoneAt,
} from '../sim/world';
import { GroundLayer } from './drive/ground';
import { Lighting, RIG_SCREEN_X, RIG_SCREEN_Y } from './drive/lighting';
import { ParticleLayer } from './drive/particles-layer';
import { PiratesMap } from './drive/pirates-map';

type KeyMap = Record<'W' | 'A' | 'S' | 'D' | 'F' | 'E' | 'H', Phaser.Input.Keyboard.Key>;

/** Pixels of ground travelled per tread animation frame. */
const TREAD_STEP = 2.5;

/** The real-time driving scene: world, Particle X, sun hazards and the rig. */
export class DriveScene extends Phaser.Scene {
  private ground!: GroundLayer;
  private sparks!: ParticleLayer;
  private lighting!: Lighting;
  private pirates!: PiratesMap;
  private grace = new Grace();
  private rig!: Phaser.GameObjects.Image;
  private city!: Phaser.GameObjects.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: KeyMap;

  private k: Kinematics = { x: 0, y: 0, heading: 0, vx: 0, vy: 0 };
  private odometer = 0;
  private frozen = false;
  private destroyedPending = false;
  /** Set once the saved game is back in place; stops one last frame overwriting it. */
  private restarting = false;
  private rigSig = '';
  private rigTextures: string[] = [];

  constructor() {
    super('drive');
  }

  /** Stop input and the world clock (battles, the city menus, rescue waits). */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  create(): void {
    const s = getState();
    this.k = { x: s.player.x, y: s.player.y, heading: s.player.heading, vx: 0, vy: 0 };
    this.odometer = 0;
    this.frozen = false;
    this.destroyedPending = false;
    this.restarting = false;
    this.rigSig = '';
    ui.message = null;

    this.ground = new GroundLayer(this, s.seed);
    this.ground.prime(this.k.x, this.k.y);
    this.sparks = new ParticleLayer(this, s.seed);
    this.city = this.add.image(0, 0, ensureCityTexture(this)).setOrigin(1, CITY_DOCK_Y / CITY_H).setDepth(3);
    this.rig = this.add.image(0, 0, ensureRigTextures(this, s.vehicle)[0]).setDepth(10);
    this.lighting = new Lighting(this);
    this.pirates = new PiratesMap(this, makeRng(randomSeed()));
    this.grace = new Grace();
    this.events.off('battle-done');
    this.events.on('battle-done', this.onBattleDone, this);
    this.events.off('city-done');
    this.events.on('city-done', this.onCityDone, this);

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard input is required');
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,F,E,H') as KeyMap;

    hooks.onDestroyed = (reason) => this.handleDestroyed(reason);
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
  }

  update(time: number, delta: number): void {
    if (this.restarting) return;
    const prev = getState();
    const tNew = advance(prev.t, delta, this.frozen);
    const dt = tNew - prev.t;
    const stats = vehicleStats(prev.vehicle);
    const broken = isBroken(prev.vehicle);
    const k = this.k;

    // the city drifts along with the night; place the copy nearest the rig
    const cityPos = cityPosition(tNew);
    const cityY = nearestCopy(cityPos.y, k.y);
    const cityTop = cityY - CITY_DOCK_Y;
    const inCity = (x: number, y: number): boolean =>
      x >= cityPos.x - CITY_W && x <= cityPos.x && y >= cityTop && y <= cityTop + CITY_H;
    const startedInCity = inCity(k.x, k.y);
    const env: DriveEnv = {
      blocked: (x, y) => terrainAt(prev.seed, x, y) === 'cliff' || (!startedInCity && inCity(x, y)),
      terrainSpeed: (x, y) => TERRAIN_SPEED[terrainAt(prev.seed, x, y)],
    };

    const canDrive = !this.frozen && !broken;
    const throttle = canDrive ? (this.isDown(this.cursors.up, this.keys.W) ? 1 : 0) - (this.isDown(this.cursors.down, this.keys.S) ? 1 : 0) : 0;
    const steer = canDrive ? (this.isDown(this.cursors.right, this.keys.D) ? 1 : 0) - (this.isDown(this.cursors.left, this.keys.A) ? 1 : 0) : 0;

    if (dt > 0) {
      this.k = stepDriving(k, { throttle, steer }, dt, { topSpeed: stats.topSpeed, accel: stats.accel }, env);
      this.odometer += forwardSpeed(this.k) * dt;
    }
    const nk = this.k;

    let vehicle = prev.vehicle;
    if (dt > 0 && throttle !== 0) vehicle = burnFuel(vehicle, throttle, dt);

    if (!this.frozen && Phaser.Input.Keyboard.JustDown(this.keys.F)) vehicle = transferToTank(vehicle);

    if (dt > 0 && vehicle.cargo < stats.cargoCap) {
      const layout = rigLayout(vehicle.hullId);
      const back = layout.rearY - layout.pivotY;
      const got = collect(
        prev.seed,
        getDepletion(),
        nk.x - Math.cos(nk.heading) * back,
        nk.y - Math.sin(nk.heading) * back,
        stats.collectRadius,
        tNew,
      );
      if (got > 0) vehicle = addCargo(vehicle, got).v;
    }
    if (Math.floor(tNew) !== Math.floor(prev.t)) getDepletion().prune(tNew);

    const heat = heatDps(nk.y, tNew);
    if (heat > 0 && dt > 0) vehicle = { ...vehicle, hp: Math.max(0, vehicle.hp - heat * dt) };

    setState({ ...prev, t: tNew, player: { x: nk.x, y: nk.y, heading: nk.heading }, vehicle });

    const zone = zoneAt(nk.y, tNew);
    const dist = Math.hypot(nk.x - cityPos.x, nk.y - cityY);
    ui.nearDock = dist <= BALANCE.DOCK_RADIUS;
    ui.scorching = zone === 'scorch';
    ui.broken = isBroken(vehicle);
    ui.fuelHint = vehicle.fuel < stats.tankCap * 0.3 && vehicle.cargo > 0;
    if (zone === 'dawn' && !this.frozen) this.handleDestroyed('dawn');

    const dockPressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (dockPressed && ui.nearDock && !this.frozen && !this.destroyedPending) this.enterCity();

    this.grace.tick(dt);
    if (!this.frozen) {
      const contact = this.pirates.update(dt, time, { x: nk.x, y: nk.y }, {
        zone,
        cargo: vehicle.cargo,
        strength: stats.strength,
        easy: !prev.flags.easyStartOver,
        graceActive: this.grace.active,
      });
      if (contact) this.startBattle(contact);
    }

    this.draw(time, dt, tNew, vehicle, zone, cityPos.x, cityY);
  }

  private isDown(a: Phaser.Input.Keyboard.Key, b: Phaser.Input.Keyboard.Key): boolean {
    return a.isDown || b.isDown;
  }

  private draw(
    time: number,
    dt: number,
    t: number,
    vehicle: ReturnType<typeof getState>['vehicle'],
    zone: ReturnType<typeof zoneAt>,
    cityX: number,
    cityY: number,
  ): void {
    const k = this.k;
    const sig = rigSignature(vehicle);
    if (sig !== this.rigSig) {
      this.rigSig = sig;
      this.rigTextures = ensureRigTextures(this, vehicle);
      const layout = rigLayout(vehicle.hullId);
      this.rig.setOrigin(layout.pivotX / layout.w, layout.pivotY / layout.h);
    }
    const phase = Math.floor(Math.abs(this.odometer) / TREAD_STEP) % 3;
    this.rig.setTexture(this.rigTextures[phase]);
    this.rig.setPosition(k.x, k.y).setRotation(k.heading + Math.PI / 2);
    this.city.setPosition(cityX, cityY);

    const scrollX = Math.round(k.x - RIG_SCREEN_X);
    const scrollY = Math.round(k.y - RIG_SCREEN_Y);
    this.cameras.main.setScroll(scrollX, scrollY);

    this.ground.update(k.x, k.y);
    this.sparks.update(scrollX, scrollY, t, time);
    this.lighting.update({
      t,
      playerY: k.y,
      scrollY,
      heading: k.heading,
      zone,
      scorchDepth: scorchDepth(k.y, t),
      secondsUntilDawn: secondsUntilDawn(k.y, t),
      dt,
    });
  }

  /** Pirates caught the rig: freeze the world and hand over to the turn-based fight. */
  private startBattle(group: PirateGroup): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.scene.launch('battle', { enemies: group.pirates });
  }

  /** Dock with the city: freeze the world and open the city menu (which autosaves). */
  private enterCity(): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.pirates.clear();
    this.scene.launch('city');
  }

  /** Back from the city: the menu has placed the rig beside the dock. */
  private onCityDone(): void {
    const p = getState().player;
    this.k = { x: p.x, y: p.y, heading: p.heading, vx: 0, vy: 0 };
    this.grace.start();
    this.frozen = false;
  }

  /** The fight is over; give the player breathing room before the next pirates. */
  private onBattleDone(): void {
    this.pirates.clear();
    this.grace.start();
    this.frozen = false;
  }

  private handleDestroyed(reason: DestroyReason): void {
    if (this.destroyedPending) return;
    this.destroyedPending = true;
    this.frozen = true;
    ui.message = reason === 'dawn' ? 'THE DAWN CAUGHT YOU' : 'BURNED BY THE SUN';
    this.time.delayedCall(2000, () => {
      const saved = loadGame() ?? newGame(getState().seed);
      this.restarting = true;
      setState(saved);
      resetDepletion();
      ui.message = null;
      this.scene.restart();
    });
  }
}
