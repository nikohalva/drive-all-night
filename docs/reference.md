# Drive All Night: game reference

Components, upgrades and rules as of **0.4.2-alpha**. The numbers live in `src/config/` and `src/sim/`; if they differ from this file, the code is right. Update this file when they change.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | drive |
| F | move cargo into the fuel tank |
| E | dock at a city or enter a mine |
| H | call for help when broken down |
| M | world map (Z zooms) |
| C | crew |

## Rig hulls

Hulls are bought in any city. Buying the Juggernaut wins.

| Hull | Price | Hull points | Collector slots | Weapon slots | Cargo / armor slots | Escorts | Crew seats |
|---|---|---|---|---|---|---|---|
| Scout | free | 60 | 1 | 1 | 1 / 1 | 2 | 2 |
| Hauler | 4000 | 140 | 2 | 2 | 1 / 1 | 4 | 4 |
| Juggernaut | 15000 | 300 | 3 | 3 | 2 / 2 | 6 | 5 |

Every hull has one engine and one tank slot. Bigger hulls burn more fuel: 0.25, 0.5 and 0.75 per second.

## Parts

Prices are before the city's price factor. Tier 1 is the starter gear.

| Part | Tier | Price | Effect |
|---|---|---|---|
| Sand Runner (engine) | 1 | 0 | speed 80, acceleration 60 |
| Dune Hammer | 2 | 600 | speed 105, acceleration 80 |
| Dusk Chaser | 3 | 2200 | speed 130, acceleration 100 |
| Jerry Cell (tank) | 1 | 0 | fuel 40 |
| Dune Drum | 2 | 400 | fuel 80 |
| Void Reservoir | 3 | 1500 | fuel 140 |
| Sweeper Bar (collector) | 1 | 0 | sweep radius 8 |
| Wide Sweeper | 2 | 500 | sweep radius 12 |
| Ion Rake | 3 | 1800 | sweep radius 18 |
| Hopper (cargo) | 1 | 0 | holds 60 |
| Bulk Hold | 2 | 700 | holds 140 |
| Vault Bay | 3 | 2500 | holds 300 |
| Plate Skirt (armor) | 1 | 0 | armor 1 |
| Ablative Shell | 2 | 900 | armor 3, hull +20 |
| Bastion Armor | 3 | 3000 | armor 6, hull +50 |
| Pulse Gun (weapon) | 1 | 0 | damage 8, accuracy 80% |
| Twin Autocannon | 2 | 1200 | damage 14, accuracy 75% |
| Arc Lance | 3 | 3500 | damage 24, accuracy 70% |

- Armor reduces each hit by its value. It does not help against sun heat.
- Each fitted weapon fires. Only the fastest engine counts.
- Extra collectors add 4 to the best one's radius. Cargo and armor add up.
- **Repair kit:** 60 credits, restores 40 hull in battle.

## Escorts

Values are MK1 / MK2 / MK3. Sold back at half price. Each burns 0.08 extra fuel per second, even when wrecked. The caravan moves at its slowest vehicle's speed.

| Escort (role) | Price | Hull | Armor | Speed | Special |
|---|---|---|---|---|---|
| Dust Sweeper (collector) | 500 / 1400 / 3200 | 30 / 50 / 80 | 0 / 1 / 2 | 85 / 95 / 105 | sweep 8 / 12 / 16, cargo +60 / 120 / 220 |
| Lance Gunship | 900 / 2200 / 4800 | 45 / 80 / 130 | 1 / 2 / 4 | 90 / 100 / 110 | damage 9 / 15 / 24; MK3 reaches the back row |
| Bulwark (guardian) | 800 / 2000 / 4400 | 70 / 120 / 190 | 3 / 5 / 8 | 75 / 85 / 95 | guards; damage 4 / 6 / 9 |
| Night Fox (scout) | 600 / 1500 / 3400 | 30 / 45 / 70 | 0 / 1 / 2 | 120 / 135 / 150 | sight +400 / 600 / 800, spots, +10% flee; damage 5 / 7 / 10 |
| Fuel Hauler (tanker) | 500 / 1300 / 3000 | 40 / 70 / 110 | 1 / 2 / 3 | 80 / 90 / 100 | tank +60 / 120 / 200 |
| Patch Rig (medic) | 900 / 2100 / 4600 | 40 / 65 / 100 | 1 / 2 / 3 | 85 / 95 / 105 | repairs an ally 20 / 35 / 55 |

A wrecked escort (hull 0) is towed until repaired in a city.

## Battle

Turn-based, with a front and a back row. Only long-range or spotted attacks reach the back row while the front stands.

| Order | Who | Effect |
|---|---|---|
| Fire | anyone with a gun | shoot a target |
| Guard | Bulwark | takes an ally's hits at half damage |
| Repair | Patch Rig | restores an ally's hull |
| Spot | Night Fox | everyone can hit the back row, +15% accuracy |
| Brace | anyone | half damage |
| Swap row | anyone | move between front and back |
| Repair kit | your rig | restore 40 hull |
| Flee | your rig | the whole caravan tries to escape |

**Q** gives automatic orders to everyone still waiting.

## Crew

You are the **Road Captain**: always aboard, never hurt, no bonus.

| Role | Bonus per skill level |
|---|---|
| Driver | +4% speed; on your rig also 6% less fuel |
| Mechanic | repairs 0.04 hull per second while driving, up to 60% |
| Gunner | +8% damage, +4% accuracy |
| Comms & Navigation | +150 sight, +5% flee (best in the caravan) |
| Medic | faster healing, 20% chance to save a dying person |

Only the best fit person of each role counts in a vehicle.

| Skill | Level | Hiring price |
|---|---|---|
| Green | 0 (no bonus) | comes with a bought escort |
| Able | 1 | 150 |
| Seasoned | 2 | 450 |
| Legend | 3 | 1100 |

| Trait | Effect |
|---|---|
| Steady | hurt less often |
| Tough | smaller wounds |
| Lucky | may cheat death |
| Hardy | heals twice as fast |
| Thrifty | 30% cheaper to hire |
| Dreamer, Grump, Joker | colour only |

- **Seats:** your rig has 2 / 4 / 5 by hull; an escort has its MK number plus one; the reserve holds 3.
- **Escorts need someone fit aboard**, or they are towed: no guns, sweeping or scouting.
- **Health:** 0-100. Below 40 a person cannot work.
- **Wounds** come from battle damage; a wrecked vehicle is very dangerous.
- **Healing** happens slowly on the road, or at once in a city (SERVICES, 1 credit per health point).
- **Recruits:** four per city, changing every 15 minutes.

## Cities

| City | Sells X at | Fuel | Repair | Price factor | Parts | Escorts |
|---|---|---|---|---|---|---|
| Neon Ark | 4 | 6 | 3 | 0.95 | engines, collectors, cargo, Dune Drum | collector, scout, tanker |
| Dusk Citadel (start) | 5 | 7 | 2 | 1.00 | all | all |
| Ember Spire | 6 | 8 | 1 | 1.05 | armor, weapons, tanks | guardian, gunship, medic |

Cities that trail farther behind the sunset pay more for Particle X. The game is saved when you dock.

## Bank

Deposit and withdraw in any city (all or 500 at a time). Mines are not part of the bank. Losing a fight takes your cargo and every credit you carry; banked credits are safe. City purchases and services use carried credits first, then the bank. Mines take carried credits only.

## Garages

- You own the garage in Dusk Citadel from the start.
- In other cities: buy for 3000, or rent for 200 per 20 minutes. Contents stay if the rent lapses; pay again to reach them.
- A garage holds any number of parts and up to 6 vehicles. A parked vehicle's crew moves to the reserve.
- The rig carries 3 / 6 / 10 spare parts by hull. With no room, a part bought or removed goes to your garage in that city, if you have one.

## Salvage

- Each beaten enemy: 25% chance of a spare part (tier 2; sometimes tier 3 from level 8).
- Each won fight: 6% plus 0.5% per enemy level to capture a vehicle (MK1, or MK2 from level 8). It arrives with 30% hull and no crew.
- Anything you have no room for is left behind.

## Night barons

Twelve mines, open only at night. A baron's temper sets the starting standing and what the clan sells.

| Temper | Starting standing | Sells |
|---|---|---|
| Warlike | -40 | weapons, armor, Dusk Chaser |
| Wary | 0 | Ablative Shell, Twin Autocannon, tanks |
| Trader | 20 | cargo, collectors, Void Reservoir, Dune Hammer |

- **Standing:** hostile below -20, wary below 0, neutral below 40, then friendly.
- **Tribute:** 10 Particle X for +4, or 200 credits for +5.
- **Alliance:** 500 credits when friendly. Allied riders may join battles near their mine.
- **Trade:** closed to hostile and wary relations; prices fall as standing rises, and allies pay 20% less.

## Enemies and rescue

- **Space pirates:** fly in, mostly near the sunset.
- **Desert robbers:** prey on weak caravans near the cities.
- **Night baron war parties:** hunt near hostile mines.
- **Breakdown:** your rig stops at 0 fuel or 0 hull. The first call for help is free; later ones can cost a fee, draw raiders or arrive too late.
- **Dawn:** if it catches you, the rig is destroyed and you reload your save.
