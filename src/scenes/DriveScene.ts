import Phaser from 'phaser';
import { CITY_DOCK_Y, CITY_H, CITY_W, rigLayout, rigSignature } from '../art/painters';
import { ensureCityTexture, ensureEscortTextures, ensureMineTexture, ensureRigTextures } from '../art/textures';
import { BALANCE } from '../config/balance';
import { CITIES, CITY_BY_ID, type CityId } from '../config/cities';
import {
  getDepletion,
  getState,
  hooks,
  resetDepletion,
  setState,
  ui,
  type DestroyReason,
} from '../game/session';
import { caravanStats, isWrecked } from '../sim/caravan';
import { advance } from '../sim/clock';
import { crewTime, isCrewed } from '../sim/crew';
import { Convoy } from '../sim/convoy';
import { clearOffset, collectorLanes, easeOffset, offsetSpot } from '../sim/lanes';
import { forwardSpeed, stepDriving, type DriveEnv, type Kinematics } from '../sim/driving';
import { newGame } from '../sim/game-state';
import { collect } from '../sim/particles';
import type { PirateGroup } from '../sim/pirate-fleet';
import { Grace } from '../sim/pirates';
import { makeRng, randomSeed } from '../sim/rng';
import { loadGame } from '../sim/save';
import { TERRAIN_SPEED, isPassable, nearestPassable, terrainAt } from '../sim/terrain';
import { addCargo, burnFuel, isBroken, transferToTank, vehicleStats } from '../sim/vehicle';
import {
  cityPositions,
  nearestCity,
  heatDps,
  nearestCopy,
  scorchDepth,
  secondsUntilDawn,
  zoneAt,
} from '../sim/world';
import {
  ALLY_HELP_RADIUS,
  MINE_ENTRY_RADIUS,
  MINE_HUNT_RADIUS,
  adjustStanding,
  discoverMines,
  isMineOpen,
  mineById,
  mineSites,
  nearestMine,
  relation,
  statusOf,
} from '../sim/barons';
import { groupCap, type PirateGroup as RaidGroup } from '../sim/pirate-fleet';
import { pirateLevel } from '../sim/pirates';
import {
  baronChancePerSecond,
  isCaravanWeak,
  makeBaronParty,
  makeClanRider,
  makeRobberGroup,
  robberChancePerSecond,
} from '../sim/raids';
import type { Rng } from '../sim/rng';
import { discoverWrecks, searchWreck, wreckInReach } from '../sim/desert';
import { DesertLayer } from './drive/desert-layer';
import { GroundLayer } from './drive/ground';
import { Lighting, RIG_SCREEN_X, RIG_SCREEN_Y } from './drive/lighting';
import { ParticleLayer } from './drive/particles-layer';
import { PiratesMap } from './drive/pirates-map';
import { RescueFlow } from './drive/rescue-flow';

type KeyMap = Record<'W' | 'A' | 'S' | 'D' | 'F' | 'E' | 'H' | 'M' | 'C', Phaser.Input.Keyboard.Key>;
type CitySpot = { id: CityId; x: number; y: number };

/** Pixels of ground travelled per tread animation frame. */
const TREAD_STEP = 2.5;
/** Gap between vehicles in the convoy, in px. */
const CONVOY_SPACING = 34;

/** The real-time driving scene: world, Particle X, sun hazards and the rig. */
export class DriveScene extends Phaser.Scene {
  private ground!: GroundLayer;
  private sparks!: ParticleLayer;
  private desert!: DesertLayer;
  private lighting!: Lighting;
  private pirates!: PiratesMap;
  private rescue!: RescueFlow;
  private grace = new Grace();
  private rig!: Phaser.GameObjects.Image;
  private cities = new Map<CityId, Phaser.GameObjects.Image>();
  /** The city whose dock the rig is beside, if any. */
  private dockCity: CityId | null = null;
  /** Scene time before which an M press does not open the map (see map-done). */
  private mapReopenAt = 0;
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
  private convoy = new Convoy();
  /** Current sideways offset of each collector from the column (by escort id). */
  private flank = new Map<number, number>();
  private escortSprites = new Map<number, Phaser.GameObjects.Image>();
  /** Where each escort is on the road this frame (by escort id). */
  private escortSpots = new Map<number, { x: number; y: number; heading: number }>();
  private mineSprites = new Map<string, Phaser.GameObjects.Image>();
  /** The open mine whose entrance the rig is at, if any. */
  private dockMine: string | null = null;
  /** The raid currently being fought, so standings can change afterwards. */
  private currentRaid: RaidGroup | null = null;
  private raidTimer = 0;
  private raidRng: Rng = makeRng(1);

  constructor() {
    super('drive');
  }

  /** Stop input and the world clock (battles, the city menus, rescue waits). */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  create(): void {
    this.unstick();
    const s = getState();
    this.k = { x: s.player.x, y: s.player.y, heading: s.player.heading, vx: 0, vy: 0 };
    this.odometer = 0;
    this.frozen = false;
    this.destroyedPending = false;
    this.restarting = false;
    this.rigSig = '';
    ui.message = null;

    this.ground = new GroundLayer(this, s.seed);
    this.ground.prime(Math.round(this.k.x - RIG_SCREEN_X), Math.round(this.k.y - RIG_SCREEN_Y));
    this.sparks = new ParticleLayer(this, s.seed);
    this.desert = new DesertLayer(this, s.seed);
    this.cities = new Map();
    for (const c of CITIES) {
      const img = this.add.image(0, 0, ensureCityTexture(this)).setOrigin(1, CITY_DOCK_Y / CITY_H).setDepth(3);
      this.cities.set(c.id, img.setTint(c.tint));
    }
    this.rig = this.add.image(0, 0, ensureRigTextures(this, s.vehicle)[0]).setDepth(10);
    this.convoy = new Convoy();
    this.convoy.reset(this.k.x, this.k.y);
    this.escortSprites = new Map();
    this.escortSpots = new Map();
    this.flank = new Map();
    this.mineSprites = new Map();
    for (const m of mineSites(s.seed)) {
      this.mineSprites.set(m.id, this.add.image(m.x, m.y, ensureMineTexture(this, true)).setDepth(3));
    }
    this.raidRng = makeRng(randomSeed());
    this.raidTimer = 0;
    this.currentRaid = null;
    this.lighting = new Lighting(this);
    this.pirates = new PiratesMap(this, makeRng(randomSeed()));
    this.grace = new Grace();
    this.rescue = new RescueFlow(this, makeRng(randomSeed()), {
      freeze: (frozen) => this.setFrozen(frozen),
      destroyed: (reason) => this.handleDestroyed(reason),
      nearCity: () => {
        const s = getState();
        const c = nearestCity(s.player.x, s.player.y, s.t);
        return Math.hypot(c.x - s.player.x, c.y - s.player.y) < 3000;
      },
    });
    this.events.off('battle-done');
    this.events.on('battle-done', this.onBattleDone, this);
    this.events.off('city-done');
    this.events.on('city-done', this.onCityDone, this);
    this.events.off('baron-done');
    this.events.on('baron-done', this.onCityDone, this);
    this.events.off('map-done');
    this.events.on('map-done', () => {
      // the M press that closed the map also reaches this scene; don't let it reopen the map
      this.mapReopenAt = this.time.now + 250;
      this.setFrozen(false);
    });
    this.events.off('crew-done');
    this.events.on('crew-done', () => {
      this.mapReopenAt = this.time.now + 250;
      this.setFrozen(false);
    });

    const kb = this.input.keyboard;
    if (!kb) throw new Error('keyboard input is required');
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,F,E,H,M,C') as KeyMap;

    hooks.onDestroyed = (reason) => this.handleDestroyed(reason);
    if (!this.scene.isActive('hud')) this.scene.launch('hud');
  }

  update(time: number, delta: number): void {
    if (this.restarting) return;
    const prev = getState();
    const tNew = advance(prev.t, delta, this.frozen);
    const dt = tNew - prev.t;
    const stats = vehicleStats(prev.vehicle);
    const caravan = caravanStats(prev);
    const broken = isBroken(prev.vehicle);
    const k = this.k;

    // the cities drift along with the night; place the copy of each nearest the rig
    const cities: CitySpot[] = cityPositions(tNew).map((c) => ({ ...c, y: nearestCopy(c.y, k.y) }));
    const inCity = (x: number, y: number): boolean =>
      cities.some((c) => x >= c.x - CITY_W && x <= c.x && y >= c.y - CITY_DOCK_Y && y <= c.y - CITY_DOCK_Y + CITY_H);
    const startedInCity = inCity(k.x, k.y);
    const env: DriveEnv = {
      blocked: (x, y) => !isPassable(terrainAt(prev.seed, x, y)) || (!startedInCity && inCity(x, y)),
      terrainSpeed: (x, y) => TERRAIN_SPEED[terrainAt(prev.seed, x, y)],
    };

    const canDrive = !this.frozen && !broken;
    const throttle = canDrive ? (this.isDown(this.cursors.up, this.keys.W) ? 1 : 0) - (this.isDown(this.cursors.down, this.keys.S) ? 1 : 0) : 0;
    const steer = canDrive ? (this.isDown(this.cursors.right, this.keys.D) ? 1 : 0) - (this.isDown(this.cursors.left, this.keys.A) ? 1 : 0) : 0;

    if (dt > 0) {
      this.k = stepDriving(k, { throttle, steer }, dt, { topSpeed: caravan.topSpeed, accel: stats.accel }, env);
      this.odometer += forwardSpeed(this.k) * dt;
    }
    const nk = this.k;
    this.convoy.record(nk.x, nk.y);
    this.escortSpots = new Map(
      this.convoy.followers(prev.caravan.length, CONVOY_SPACING).map((f, i) => [prev.caravan[i].id, f]),
    );
    // working collectors fan out to sweep their own lanes, tucking in around anything solid
    const radii = caravan.collectors.map((c) => c.radius);
    const bodyGap = rigLayout(prev.vehicle.hullId).w / 2 + 14;
    const lanes = collectorLanes(bodyGap, stats.collectRadius, radii);
    const offGround = (x: number, y: number): boolean => !isPassable(terrainAt(prev.seed, x, y)) || inCity(x, y);
    caravan.collectors.forEach((c, i) => {
      const spot = this.escortSpots.get(c.id);
      if (!spot) return;
      const offset = easeOffset(this.flank.get(c.id) ?? 0, clearOffset(spot, lanes[i], offGround), dt);
      this.flank.set(c.id, offset);
      this.escortSpots.set(c.id, { ...spot, ...offsetSpot(spot, offset) });
    });

    let vehicle = prev.vehicle;
    if (dt > 0 && throttle !== 0) vehicle = burnFuel(vehicle, throttle, dt * caravan.fuelFactor, caravan.fuelBurnExtra);

    if (!this.frozen && Phaser.Input.Keyboard.JustDown(this.keys.F)) vehicle = transferToTank(vehicle, caravan.tankCap);

    if (dt > 0 && vehicle.cargo < caravan.cargoCap) {
      const layout = rigLayout(vehicle.hullId);
      const back = layout.rearY - layout.pivotY;
      // the lead sweeps behind itself; every working collector sweeps where it rolls
      const sweeps = [
        { x: nk.x - Math.cos(nk.heading) * back, y: nk.y - Math.sin(nk.heading) * back, r: stats.collectRadius },
        ...caravan.collectors.flatMap((c) => {
          const spot = this.escortSpots.get(c.id);
          return spot ? [{ x: spot.x, y: spot.y, r: c.radius }] : [];
        }),
      ];
      for (const sweep of sweeps) {
        const got = collect(prev.seed, getDepletion(), sweep.x, sweep.y, sweep.r, tNew);
        if (got > 0) vehicle = addCargo(vehicle, got, caravan.cargoCap).v;
      }
    }
    if (Math.floor(tNew) !== Math.floor(prev.t)) getDepletion().prune(tNew);

    const heat = heatDps(nk.y, tNew);
    if (heat > 0 && dt > 0) vehicle = { ...vehicle, hp: Math.max(0, vehicle.hp - heat * dt) };

    setState(crewTime({ ...prev, t: tNew, player: { x: nk.x, y: nk.y, heading: nk.heading }, vehicle }, dt));

    // scouts widen how far the caravan sees; a mine is found once it comes into sight
    const found = discoverMines(getState(), nk.x, nk.y, caravan.sight);
    if (found.length > 0) {
      const now = getState();
      setState({ ...now, known: [...now.known, ...found] });
      const m = mineById(now.seed, found[0]);
      if (m) {
        ui.toast = `FOUND A MINE: ${m.baron} OF THE ${m.clan}`;
        ui.toastUntil = time + 5000;
      }
    }

    setState(discoverWrecks(getState(), nk.x, nk.y, caravan.sight));
    const wreck = wreckInReach(getState(), nk.x, nk.y);

    const zone = zoneAt(nk.y, tNew);
    const dock = cities.find((c) => Math.hypot(nk.x - c.x, nk.y - c.y) <= BALANCE.DOCK_RADIUS);
    this.dockCity = dock ? dock.id : null;
    ui.nearDock = !!dock;
    ui.dockName = dock ? CITY_BY_ID[dock.id].name : null;
    ui.scorching = zone === 'scorch';
    ui.broken = isBroken(vehicle);
    ui.fuelHint = vehicle.fuel < caravan.tankCap * 0.3 && vehicle.cargo > 0;
    const near = nearestMine(prev, nk.x, nk.y);
    const entrance = Math.hypot(near.mine.x - nk.x, nearestCopy(near.mine.y + 24, nk.y) - nk.y);
    const atMine = entrance <= MINE_ENTRY_RADIUS && !ui.nearDock;
    const mineOpen = atMine && isMineOpen(near.mine, tNew);
    this.dockMine = mineOpen ? near.mine.id : null;
    ui.nearMine = mineOpen ? near.mine.baron : null;
    ui.mineSealed = atMine && !mineOpen;
    ui.nearWreck = !!wreck && !ui.nearDock && !this.dockMine;
    if (zone === 'dawn' && !this.frozen) this.handleDestroyed('dawn');

    const dockPressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    if (dockPressed && ui.nearDock && !this.frozen && !this.destroyedPending) this.enterCity();
    else if (dockPressed && this.dockMine && !this.frozen && !this.destroyedPending) this.enterMine();
    else if (dockPressed && wreck && !this.frozen && !this.destroyedPending) {
      const found = searchWreck(getState(), wreck.id);
      setState(found.state);
      // a search can refill a dry tank or fill the hold: keep this frame's vehicle in step
      vehicle = found.state.vehicle;
      ui.toast = found.report.join('. ');
      ui.toastUntil = time + 5000;
    }
    const mapPressed = Phaser.Input.Keyboard.JustDown(this.keys.M);
    if (mapPressed && !this.frozen && !this.destroyedPending && this.time.now >= this.mapReopenAt) this.openMap();
    const crewPressed = Phaser.Input.Keyboard.JustDown(this.keys.C);
    if (crewPressed && !this.frozen && !this.destroyedPending && this.time.now >= this.mapReopenAt) this.openCrew();
    const helpPressed = Phaser.Input.Keyboard.JustDown(this.keys.H);
    if (helpPressed && ui.broken && !this.frozen && !this.destroyedPending && !this.rescue.active) this.rescue.begin();

    this.grace.tick(dt);
    // a rig with no hull left has nothing to fight with: pirates leave it to the rescue call
    const helpless = vehicle.hp <= 0;
    if (helpless) this.pirates.clear();
    const groundBlocked = (x: number, y: number): boolean => !isPassable(terrainAt(prev.seed, x, y));
    if (!this.frozen) {
      const contact = this.pirates.update(dt, time, { x: nk.x, y: nk.y }, {
        zone,
        cargo: vehicle.cargo,
        strength: stats.strength,
        easy: !prev.flags.easyStartOver,
        graceActive: this.grace.active,
        helpless,
      }, groundBlocked);
      if (contact) this.startBattle(contact);
      else if (!helpless && !this.grace.active) this.rollRaids(dt, zone, stats.strength, vehicle.cargo, !prev.flags.easyStartOver);
    }

    this.draw(time, dt, tNew, vehicle, zone, cities);
  }

  /** Escort sprites follow the convoy positions; wrecked ones are towed, dark and dim. */
  private drawEscorts(phase: number): void {
    const caravan = getState().caravan;
    const ids = new Set(caravan.map((e) => e.id));
    for (const [id, img] of this.escortSprites) {
      if (!ids.has(id)) {
        img.destroy();
        this.escortSprites.delete(id);
      }
    }
    for (const e of caravan) {
      const spot = this.escortSpots.get(e.id);
      if (!spot) continue;
      const towed = isWrecked(e) || !isCrewed(getState(), e.id);
      const key = ensureEscortTextures(this, e.kind, e.tier)[towed ? 0 : phase];
      let img = this.escortSprites.get(e.id);
      if (!img) {
        img = this.add.image(0, 0, key).setDepth(9);
        this.escortSprites.set(e.id, img);
      }
      img.setTexture(key).setPosition(spot.x, spot.y).setRotation(spot.heading + Math.PI / 2);
      if (towed) img.setTint(0x555566).setAlpha(0.8);
      else img.clearTint().setAlpha(1);
    }
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
    cities: CitySpot[],
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
    for (const c of cities) this.cities.get(c.id)?.setPosition(c.x, c.y);
    this.drawEscorts(phase);
    this.drawMines(t);

    const scrollX = Math.round(k.x - RIG_SCREEN_X);
    const scrollY = Math.round(k.y - RIG_SCREEN_Y);
    this.cameras.main.setScroll(scrollX, scrollY);

    this.ground.update(scrollX, scrollY);
    this.sparks.update(scrollX, scrollY, t, time);
    this.desert.update(scrollX, scrollY, time, getState().wrecks.searched);
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

  /** Once a second, maybe a robber gang or a hostile baron's war party comes for the caravan. */
  private rollRaids(dt: number, zone: ReturnType<typeof zoneAt>, strength: number, cargo: number, easy: boolean): void {
    this.raidTimer += dt;
    if (this.raidTimer < 1) return;
    this.raidTimer -= 1;
    if (this.pirates.count >= groupCap(easy)) return;
    const s = getState();
    const p = s.player;
    const city = nearestCity(p.x, p.y, s.t);
    const robberChance = robberChancePerSecond(zone, Math.hypot(city.x - p.x, city.y - p.y), isCaravanWeak(s), easy);
    const near = nearestMine(s, p.x, p.y);
    const baronChance =
      near.dist < MINE_HUNT_RADIUS ? baronChancePerSecond(zone, statusOf(relation(s, near.mine)), near.dist, easy) : 0;
    const roll = this.raidRng();
    let group: RaidGroup | null = null;
    if (roll < robberChance) {
      const level = pirateLevel(strength, cargo, easy);
      group = { id: this.pirates.claimId(), x: 0, y: 0, level, pirates: makeRobberGroup(this.raidRng, level, easy), faction: 'robbers' };
    } else if (roll < robberChance + baronChance) {
      const level = pirateLevel(strength, 0, false);
      group = {
        id: this.pirates.claimId(),
        x: 0,
        y: 0,
        level,
        pirates: makeBaronParty(this.raidRng, level, near.mine.temper),
        faction: 'baron',
        mineId: near.mine.id,
      };
    }
    if (!group) return;
    // ground raiders need open ground to start from
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = this.raidRng() * Math.PI * 2;
      // far enough out that they drive in from beyond the screen edge
      const x = p.x + Math.cos(a) * 420;
      const y = p.y + Math.sin(a) * 420;
      if (isPassable(terrainAt(s.seed, x, y))) {
        this.pirates.add({ ...group, x, y });
        return;
      }
    }
  }

  /** Raiders caught the rig: freeze the world and hand over to the turn-based fight. */
  private startBattle(group: PirateGroup): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.currentRaid = group;
    // allied clan riders sometimes ride to help near their mine
    const s = getState();
    const allied = mineSites(s.seed).find(
      (m) => relation(s, m).allied && Math.hypot(m.x - s.player.x, nearestCopy(m.y, s.player.y) - s.player.y) < ALLY_HELP_RADIUS,
    );
    const allies = allied && this.raidRng() < 0.5 ? [makeClanRider(group.level)] : [];
    this.scene.launch('battle', { enemies: group.pirates, allies });
  }

  /** Mines stay put while the night moves: draw the ones near the rig, lit while open. */
  private drawMines(t: number): void {
    const s = getState();
    for (const m of mineSites(s.seed)) {
      const img = this.mineSprites.get(m.id);
      if (!img) continue;
      const y = nearestCopy(m.y, s.player.y);
      const near = Math.abs(y - s.player.y) < 1200;
      img.setVisible(near);
      if (near) img.setPosition(m.x, y).setTexture(ensureMineTexture(this, isMineOpen(m, t)));
    }
  }

  /** Visit a night baron's hall; the clock stops while you are inside. */
  private enterMine(): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.pirates.clear();
    this.scene.launch('baron', { mineId: this.dockMine });
  }

  /** Dock with the city: freeze the world and open the city menu (which autosaves). */
  private enterCity(): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.pirates.clear();
    this.scene.launch('arrival', { cityId: this.dockCity });
  }

  /** Safety net: never leave the rig standing on blocked ground, where it could not move at all. */
  private unstick(): void {
    const s = getState();
    if (isPassable(terrainAt(s.seed, s.player.x, s.player.y))) return;
    const p = nearestPassable(s.seed, s.player.x, s.player.y);
    setState({ ...s, player: { ...s.player, x: p.x, y: p.y } });
  }

  /** Open the world map; the clock stops until it closes. */
  private openMap(): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.scene.launch('map');
  }

  /** The crew roster; the clock stops until it closes. */
  private openCrew(): void {
    this.frozen = true;
    this.k = { ...this.k, vx: 0, vy: 0 };
    this.scene.launch('crew', { from: 'drive' });
  }

  /** Back from the city: the menu has placed the rig beside the dock. */
  private onCityDone(): void {
    this.unstick();
    const p = getState().player;
    this.k = { x: p.x, y: p.y, heading: p.heading, vx: 0, vy: 0 };
    this.convoy.reset(p.x, p.y);
    this.flank.clear();
    this.grace.start();
    this.frozen = false;
  }

  /** The fight is over; give the player breathing room before the next pirates. */
  private onBattleDone(outcome?: string): void {
    const raid = this.currentRaid;
    this.currentRaid = null;
    if (raid && outcome === 'won') {
      let s = getState();
      if (raid.faction === 'baron' && raid.mineId) {
        // beating a clan's war party costs you with that baron
        s = adjustStanding(s, raid.mineId, -10);
      } else {
        // driving raiders off near a friendly mine wins its baron's favour
        const near = nearestMine(s, s.player.x, s.player.y);
        const status = statusOf(relation(s, near.mine));
        if (near.dist < ALLY_HELP_RADIUS && (status === 'FRIENDLY' || status === 'ALLIED')) s = adjustStanding(s, near.mine.id, 3);
      }
      setState(s);
    }
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
