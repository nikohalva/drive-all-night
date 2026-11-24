# Drive All Night — Round 2 Design

Date: 2026-11-24
Status: builder's design (the user said "do your thing": every decision below is the builder's call unless marked as the user's)

## What the user asked for (theirs)

- Terrain features: impassable mountains, canyons and so on.
- A bigger screen.
- Desert robbers and night barons as well as space pirates.
  - Night barons are lords of the underworld who built mines, hide in them during the day and hunt at night.
  - Not all night barons are hostile, at least not at first. You can make alliances with a baron and their clan.
  - You can visit night baron tunnels like the city vehicles.
- More than one city vehicle.
- A map showing the city vehicles and known night baron mines.
- A caravan of vehicles instead of one: collectors, fighters, defenders, scouts and others, making combat more tactical.

## Order (agreed)

1. Bigger screen + terrain.
2. More cities + world map.
3. The caravan + tactical combat.
4. Desert robbers + night barons.

Each project lands as its own commits on `feature/world-and-caravan`, with tests, before the next starts.

## Anti-goals (carried over)

Driving stays calm. Battles stay short. A mistake costs one outing, not a whole build. Nothing makes the opening harder.

---

## Project 1: Bigger screen and terrain

### Screen
- The internal resolution goes from 480×270 to **640×360**: you see a third more of the world, the pixel look is unchanged, and whole-number zoom still fits common screens (3× is exactly 1920×1080).
- Every scene reads its size from one shared `VIEW` constant instead of its own hard-coded numbers.

### Terrain
The world still wraps along y and the sun still travels toward −y. New terrain kinds:

| Kind | Passable | Looks like | Shape |
|---|---|---|---|
| mountain | no | dark violet massif, pink-lit ridge on the sunset side | large blobs from low-frequency noise; foothills around them are `rock` (slow) |
| canyon | no | near-black rift with a faint cyan glow at the bottom and a lit lip | long winding rifts running **across** the band (perpendicular to travel), so they block the way forward; every rift has passes |
| mesa | no | raised rock pillar, lit top edge, cast shadow | small scattered pillars |
| cliff | no | (unchanged) the walls at the two edges of the band | |

- **Canyons** sit on a fixed spacing of 2,400 px along y (this divides the world length, so they stay seamless across the wrap). About half the slots hold a rift. A rift's centre line wiggles (two sine waves); it is 36–56 px wide. Across x, every 700 px stretch has one 120 px **pass** with no rift.
- **City lanes** are always clear: within 140 px of any city's lane x, impassable kinds become passable (mountain → rock, canyon/mesa → sand), so a city can never be blocked and you can always drive home along its lane.
- The noise-made cliffs from round 1 are gone. `cliff` now only means the edge walls.

---

## Project 2: More cities and the world map

### Cities
Three moving cities, each a fixed distance behind the sunset line and on its own lane:

| City | Lane x | Behind sunset | Character |
|---|---|---|---|
| NEON ARK | 1100 | 6% of the night | near the rich fields: buys Particle X cheaply (4 CR), sells collectors and engines, pricier repairs |
| DUSK CITADEL | 2048 | 12% | the round-1 city, the all-rounder; new games start here |
| EMBER SPIRE | 3000 | 24% | deep in the night: pays best for X (6 CR), cheap repairs, sells armour and defence |

- Each city has its own stock list and price factor. Any city lets you dock, trade and save.
- Each city has its own sprite tint so they read apart.

### World map
- **M** opens a full-screen map. The world clock stops while it is open (as in the city).
- The map is a schematic: the band's width (4,096 px) is squeezed to the map's width and the track runs top (sunset) to bottom (dawn). Two zoom levels (Z): **local** (about 12,000 px of track) and **night** (the whole night, 86,400 px).
- It shows impassable terrain, the sunset and dawn lines, every city with its name, the **known** night baron mines coloured by how they feel about you, and you.
- A side list names each known place with how far ahead or behind it is.
- **Discovery:** cities are always known. A mine becomes known once you come within 700 px of it (scouts add range in project 3). Known mines are saved.

### Save format
- The save becomes version 2. Version-1 saves are upgraded on load (new fields get defaults), so nobody loses a game.

---

## Project 3: The caravan and tactical combat

### Caravan
- The player's own rig (hull and parts, as now) **leads** the caravan. You buy **escort vehicles** at a city's new **MOTOR POOL** tab.
- How many escorts you can lead depends on the lead hull: Scout 2, Hauler 4, Juggernaut 6.
- Escorts follow the lead in a column along the lead's own path, so they never get stuck on terrain and driving stays one-handed and calm.
- Escort roles (each in three tiers):

| Role | On the road | In battle |
|---|---|---|
| Collector | sweeps Particle X at its own position, adds hold space | weak; best kept in the back row |
| Gunship | — | heavy guns |
| Guardian | armour | GUARD an ally: attacks on that ally hit the guardian instead, at half damage |
| Scout | fast; sees mines and pirates from further away | SPOT: the whole caravan aims better this round and can hit the enemy back row |
| Tanker | adds fuel capacity | weak; back row |
| Medic rig | — | REPAIR an ally |

- Caravan stats: cargo and fuel capacity add up; the caravan's top speed is the slowest vehicle's; every escort adds a little fuel burn.
- An escort at 0 HP is **wrecked**: it keeps rolling along (towed) but does nothing until repaired at a city.

### Tactical battle
- Both sides have a **front row** and a **back row**. Ordinary weapons can only hit the enemy front row while it has anyone in it; long-range weapons, or a scout's SPOT, reach the back row.
- Each round you give every vehicle an order in turn (the lead first), then the round plays out: your vehicles act, then the enemy.
- Orders: FIRE (pick a target), GUARD (guardians), REPAIR (medics), SPOT (scouts), BRACE, MOVE (swap rows), and for the lead also REPAIR KIT and FLEE (the whole caravan; chance from the slowest vehicle against the fastest enemy, +10% per scout).
- Enemies have roles too (front-liners, back-row long-range shooters) and pick on the weak: low-HP and back-row-exposed vehicles.
- **Losing** means the lead's hull reached 0: cargo is taken, wrecked escorts stay wrecked, and the lead breaks down as now. Winning pays credits and cargo.
- The easy start stays: a starter rig with no escorts still beats an easy-start pirate.

---

## Project 4: Desert robbers and night barons

### Desert robbers
- Ground raiders that trail the cities and prey on the weak. They spawn mostly within 3,000 px of a city and in deep night, and more often when your caravan is hurt (wrecked escorts, or lead under half hull).
- They drive on the ground, so terrain blocks them (they slide along obstacles).
- Their units: buggies (front), harpoon trucks (front; a hit can rip away cargo), mortars (back, long range).
- Breaking down near a city is dangerous: a distress call there may bring robbers instead of help, and help costs double.

### Night barons
- **Mines**: 12 mines at fixed, seeded places around the planet (never on a city lane). Each has a baron, a clan, and a temper: **warlike** (starts hostile), **wary** (starts neutral) or **trader** (starts friendly).
- Because mines stay put while the night moves, a mine is open only while it is in darkness (sunset band, deep night or pre-dawn). By day it is "SEALED UNTIL NIGHT".
- **Standing** with each baron runs from −100 to 100: HOSTILE (below −20), WARY, NEUTRAL, FRIENDLY (40+) and ALLIED (an alliance you made).
- Hostile barons' war parties hunt within 4,000 px of their mine at night. Neutral and friendly barons leave you alone.
- **Visiting a mine** (E at the entrance, at night) opens the baron's hall, like a city:
  - STANDING: who they are and how they feel about you.
  - TRIBUTE: give Particle X or credits to raise standing.
  - TRADE: clan-made parts and escorts, at better prices the better your standing (some only from friends).
  - ALLIANCE: at FRIENDLY you may swear an alliance (a tribute). Allies give a 20% discount, let you save in their hall, and their clan riders sometimes join your battles near their mine.
  - LEAVE.
- Standing changes: tribute raises it, beating that baron's war party lowers it, beating pirates or robbers near a friendly or allied mine raises it a little.
- Baron units: war crawlers (front, heavy), shades (back, long range), and at warlike mines a baron champion.

### Map
Known mines show on the map in their standing's colour, with the baron's name.

---

## Left to the builder
Exact numbers (stats, prices, spawn rates, standing steps), names, and sprite details, within the shapes above. Every tunable lives in `src/config/`.

---

## As built (notes after the final review)

- **Easy start:** night baron war parties do not hunt you during the easy start. Afterwards, small parties are a lone war crawler; shades join from level 4 and champions at warlike mines from level 8.
- **Mines:** every mine has a checked entrance and exit on open ground. As a safety net, the rig is moved to the nearest open ground whenever it would start on blocked ground.
- **Cut for now:** clan trade sells parts only, not escorts. Scouts' extra sight finds mines but does not warn of raiders earlier.
- **Known small issues:** with five or more vehicles in one battle row, sprites can run under the log or the order panel. Untested save paths: v2→v4 and v3→v4 upgrades work by the same step-by-step code as v1→v4 but have no test of their own.
