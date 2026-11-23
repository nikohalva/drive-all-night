# Drive All Night — Design (first playable)

Date: 2026-11-23
Status: approved 2026-11-24

## Intent

Drive All Night is a 2D, top-down, pixel-art, open-world game that runs in the
browser.

On a distant planet the sun scorches the day side, and the planet turns so
slowly that one night lasts about a week. During the day the sun showers the
surface with **Particle X**, a valuable commodity that fuels spaceships,
vehicles and more. Particle X can only be collected at night, and it is richest
where night has *just* arrived. So collectors **chase the sunset**: they ride
just behind the dusk line while the dawn slowly creeps up from behind.

The player starts with a small, weak vehicle and grows it into a big machine
with more collectors, cargo, armor and weapons. Huge **moving cities** that
never stop also collect Particle X and ship it to space; the player docks with
them to trade, upgrade and save. **Flying space pirates** hunt near the sunset
line. (Desert robbers come later.)

### The feel

**Tense survival with relaxed driving.** Driving itself should be calm and
pleasant: cruising a dark desert, sweeping up Particle X, a city lit up on the
horizon. The tension comes from around you: the sun as the ultimate enemy, a
filling cargo hold that you could lose, fuel running low, pirates showing up
when you're loaded, and the gamble of where you break down.

## Goals (first playable)

1. Real-time top-down driving across a procedurally generated desert that loops
   around the planet.
2. A moving day/night boundary: a **sunset line** ahead and a **dawn line**
   behind, both moving at the same steady speed.
3. Collecting Particle X, richest right behind the sunset line.
4. Particle X doubles as the vehicle's fuel.
5. One moving mega-city: dock to sell Particle X, buy and fit parts, repair,
   refuel and **save**.
6. Breakdowns and the **rescue call**, with odds that depend on where you are.
7. Flying space pirates that chase you in real time, leading to
   **turn-based battles**.
8. An **easy start** that ramps up.
9. A finish line: buying the largest hull shows a victory screen.

## Non-goals (for now)

- Desert robbers (planned next; see "Later").
- More than one city.
- Multiplayer, accounts, online saves.
- Mobile/touch controls (desktop keyboard first).
- Story, quests, NPC dialogue beyond city shop menus.

## Anti-goals (failure even if it technically works)

- Driving that feels fiddly, twitchy or punishing. Driving is the calm part.
- Battles that drag or feel like a chore.
- Losing hours of progress in one mistake (saving at cities must be frequent and
  easy enough that a loss costs one outing, not a whole build).
- A hard opening. The first night must be gentle.

## Constraints

- Runs in a modern desktop browser, hosted as static files (e.g. GitHub Pages
  from the `nikohalva/drive-all-night` repository).
- Phaser 3 + TypeScript, built with Vite.
- Pixel-art look: low internal resolution scaled up by whole numbers, no
  smoothing.
- No art is supplied. The builder makes the pixel sprites and tiles following
  the art direction below; they can be replaced by hand-made art later.
- Node.js is not installed on the development machine yet; installing it is
  the first build step (Phaser + Vite need it).

## Art direction: synthwave, with heavy machines

Reference mockup: `mockups/synthwave-driving-v2.html` (approved look).

- **Palette:** retro-80s synthwave. Deep purple / indigo night ground (not
  grey), a striped sunset band of yellow → orange → hot pink → magenta, cyan
  and magenta neon accents.
- **Sunset line:** the visual star: a glowing striped band along the sunset
  edge with pink light spilling onto the sand.
- **Ground:** purple desert with a faint cyan neon grid that fades the deeper
  into the night you are; dunes rim-lit pink on the sunset side.
- **Particle X:** twinkling cyan/white sparks, densest near the sunset;
  collected ground is visibly empty.
- **Dawn:** cold, pale blue-white haze: the one color that means danger.
- **Vehicles have substance, not outlines.** Heavy, chunky, armored machines
  with bold dark outlines like a comic: solid shaded bodies lit from the sunset
  side, big wheels and tank treads that animate with movement, armor slabs,
  vents, rivets, lamps, hazard stripes, visible weapons and collector gear.
  Neon is used as accent lights (strips, underglow, lamps), never as the whole
  shape. As the player upgrades, the vehicle visibly grows: added sections,
  treads, tanks, turrets.
- **Player rig (mid-size example):** armored cab on wheels pulling a tracked
  collector unit with a ribbed Particle X tank and gauge, turret, glowing intake
  bar, taillights.
- **Pirates:** olive/gunmetal flying gunships with acid-green lights and
  exhaust, red cockpits, nose cannons; a ground shadow offset shows they fly.
- **City:** huge dark moving platform on giant treads, with glass domes,
  ribbed tanks, a lattice mast with a beacon, deck plating and neon windows;
  a lit DOCK sign marks where to enter.
- **HUD:** chunky pixel font in neon colors with a slight glow; a strip map
  from dawn to sunset showing you and the city.
- **Inspiration, not copying:** the vehicles are original designs in the
  spirit of chunky retro-futurist armored rigs; no existing characters,
  vehicles or logos are reproduced.
- **Music:** synthwave fits, but the first playable is graphics-first; a
  soundtrack is a later addition unless decided otherwise.

## Approaches considered

1. **Phaser 3 + TypeScript + Vite** — mature 2D browser engine with pixel-art
   scaling, tile maps, cameras, input, sound and scenes (which map cleanly onto
   "driving scene → battle scene → city scene"). Cost: learning Phaser.
   **Chosen.**
2. **Plain HTML canvas, no engine** — tiny and fully under our control, but
   weeks of plumbing (camera, tiles, scenes, input, sound) before it feels like
   a game.
3. **Python + pygame via pygbag** — stays in Python, but loads slowly, is awkward
   to debug in the browser and is a niche path for a smooth open world.

Heavier engines (Godot, Unity web export) were dropped: they move the work into
an editor and produce large web builds for a pixel-art game.

## Decisions made together

### The world

- The planet surface is a wide band that **loops east–west** (drive far enough
  and you come back around). North and south edges are impassable terrain
  (mountains / polar wastes).
- The sun moves steadily around the planet, so the **sunset line** and the
  **dawn line** sweep across the map at the same constant speed. Night is the
  half of the band between them.
- Particle X is laid down during the day. Once night arrives it can be
  collected. Density is highest just behind the sunset line and thins out the
  longer an area has been dark (natural decay plus other collectors).
- **Night zones**, from the sunset line back toward the dawn:
  - **Sunset band** — freshest, richest Particle X; busiest (rescue is likely);
    where pirates hunt.
  - **Deep night** — thinner Particle X; quiet; rescue slow or unlikely.
  - **Pre-dawn** — scraps only; the dawn is close.
- **Day side (ahead of the sunset line):** scorching. Driving into it does heat
  damage that rises fast the deeper you go.
- **Dawn line:** if it reaches your vehicle, the vehicle is destroyed.

### Losing and saving

- **The sun is the real enemy.** If the dawn catches you, your vehicle is
  destroyed, cargo and all, and you **reload your last city save**.
- **Saving happens only aboard the mega-city.**
- Pirates take cargo and damage you, but don't end the game on their own.

### Breakdowns and the rescue call

- If your vehicle breaks down (out of fuel, or hull reduced to zero), you can
  send a **distress call**.
- Who answers depends on where you are:
  - Near the sunset line: rescue is likely and fast, **but** the call may bring
    flying pirates instead.
  - Deep night: quiet, but rescue is slow or may not come while the dawn creeps
    closer.
  - (Later, near cities: desert robbers prey on the weak, so rescue there is
    unlikely or expensive.)

### Battles

- **Driving is real time; battles are turn based.**
- When pirates catch you on the map, the game switches to a battle screen.
- **The world clock stops during battles.** Fights are self-contained; the sun
  only threatens you while you're driving.

### Easy start and difficulty

- The game opens at dusk, right next to the city, with a gentle opening:
  pirates rare and weak, the starter vehicle able to beat one small pirate
  ship, and the city easy to find again.
- A player chasing the sunset never sees their night end, so difficulty is
  **not** tied to nights or world time. Instead:
  - **The easy start ends after the player's first sale at the city.**
  - **Long-term ramp:** pirates scale with the player's vehicle strength (hull
    tier and the value of fitted parts).
  - **Short-term risk:** pirates also scale with the cargo currently carried.

### Goal of the first playable

- The first playable has a finish line: **buying the large hull** shows a
  victory screen, after which the player can keep playing.
- Content scope: **three hulls** (starter, mid, large) and **a handful of parts
  per slot type**, spread so the path to the large hull feels like steady
  growth.

## Builder's design (proposals filled in during the conversation)

These are the builder's calls, written down so the plan has something concrete.
They can be tuned freely as long as the decisions above hold.

### Vehicle

- A **hull** decides how many part slots you have and your base hull points.
  Bigger hulls are bought at the city.
- Parts go in slots: **engine** (top speed, acceleration), **fuel tank**,
  **collector** (collection rate and width), **cargo hold** (capacity),
  **armor** (hull points / damage reduction), **weapon** (battle actions).
- **Particle X is fuel.** The vehicle burns it from a fuel tank; cargo can be
  moved into the tank at any time. Hauling more means risking more but also
  having fuel to get home.
- Speed tuning target: the starter vehicle keeps pace with the sunset line at
  roughly half throttle, so chasing the sunset is relaxed, not a race.

### Driving and collecting

- Arcade-style top-down handling: smooth steering, some drift, forgiving
  collisions. Terrain types change speed (packed sand fast, dunes slow, rock
  fields bumpy, canyons/cliffs impassable).
- Collecting is automatic while driving over Particle X; the collector sweeps a
  strip under/around the vehicle. Collected ground is depleted for the rest of
  the night.
- Night visuals: darkness with headlight cone; an orange glow on the sunset
  edge of the screen; a cold blue hint toward dawn.
- **HUD:** fuel, cargo, hull, credits, and a **strip map** showing where you are
  relative to the sunset line, the city and the dawn line.

### The moving city

- One mega-city that moves at the same speed as the night, staying a fixed
  distance behind the sunset line (inside the sunset band / deep-night border),
  so it is always somewhere you can drive back to.
- Drive up to its dock to enter. City menus pause the world clock.
- City services: sell Particle X for **credits**, buy hulls and parts, fit
  parts, repair, refuel, **save**.
- When you leave, you're placed next to the city's dock.

### Pirates

- Flying pirate craft appear on the map and chase you in real time; you can
  outrun them if you're fast enough. Contact starts a battle.
- They spawn mostly in the sunset band. The more cargo you carry, the more they
  show up and the stronger they get.
- Pirates also answer distress calls near the sunset line.

### Turn-based battle

- You vs. 1–3 pirate craft. Each turn you choose one action:
  - **Fire** a fitted weapon (each weapon is its own action with its own
    damage/accuracy/ammo or cooldown).
  - **Brace** (reduce damage this round).
  - **Repair** (use a repair kit, if you have one).
  - **Flee** (chance based on your speed vs. theirs).
- Win: salvage credits, Particle X and sometimes a part.
- Lose (hull reaches zero): pirates take your cargo (but **not** the fuel in
  your tank), and you're broken down on the map. You can send a distress call.
- Battles should be short: a typical fight is a handful of turns.

### Rescue resolution

- After a distress call, world time runs (with an option to fast-forward the
  wait). Based on your zone, one of these happens:
  - **Rescuer arrives:** patches the vehicle to minimum working hull, adds
    enough fuel to reach the city, and charges a fee. If you can't pay, it
    becomes **debt** taken from your next sale.
  - **Pirates arrive** (sunset band): they take any remaining cargo; you can
    call again.
  - **Nobody comes in time:** the dawn arrives and the vehicle is destroyed;
    reload the last save.
- The first rescue is free and guaranteed, as part of the easy start.
- If heat damage on the day side takes the hull to zero, you break down there
  like any other breakdown; the sun keeps burning, so only a fast rescue saves
  you. (Builder's call.)

### Saving

- One save slot in browser local storage, written when you choose "Save" in the
  city (plus an automatic save when you dock).
- A new game generates a fresh world seed and saves automatically at the start,
  next to the city, so there is always a save to fall back to. (Builder's call.)
- The save holds the world seed, world time, vehicle, inventory, credits, debt
  and whether the easy start is over. Which ground has already been collected only matters for the current
  night; the builder decides whether to keep it in the save.

### Testing

- Game rules that don't need the screen (Particle X density, fuel and cargo,
  economy, battle resolution, rescue odds, save/load) live in plain TypeScript
  modules with unit tests (e.g. Vitest).
- Phaser scenes stay thin and call into those modules.

## Left to the builder

- Exact part lists and stats within the scope above.
- Exact numbers: world size, sun speed (real minutes per night), prices, part
  stats, pirate stats, rescue odds and wait times.
- Procedural terrain generation method and chunking.
- Pixel resolution, palette, placeholder art and sound.
- Code layout, scene structure and how state is shared between scenes.

## Later (not in the first playable)

- **Desert robbers** that trail the cities and prey on the weak; breaking down
  near them means rescue is unlikely or expensive.
- More moving cities, each with its own shops and character.
- More hulls, parts, weapons and defenses; bigger, stranger vehicles.
- Gamepad and touch controls.
