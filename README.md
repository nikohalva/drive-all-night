# Drive All Night

A top-down synthwave pixel-art game: chase the sunset across a slow-turning planet, harvest Particle X and build up your caravan.

Play: https://nikohalva.github.io/drive-all-night/

The game is in **alpha**. Anything may still change.

Components, upgrades and rules: [game reference](docs/reference.md).

## Version history

Newest first. The version number lives in `package.json` and is shown on the title screen.
A new feature raises the middle number, a fix or small addition the last one.

### 0.6.0-alpha (2026-11-28)

- Crew wages build up while you drive. Pay them in a city, or don't: unpaid crew give no bonus, and quit after a second missed payday.
- The crew reserve holds 3, 6 or 10 people by rig size
- Older saves are upgraded automatically

### 0.5.1-alpha (2026-11-28)

- Fix: free seats can be picked in the crew screen to bring someone in
- Fix: new hires and survivors go first to a vehicle nobody is running
- R in the crew screen takes someone off their vehicle; X pressed twice removes them from the crew
- The version number is at the top right, on the title screen and while driving

### 0.5.0-alpha (2026-11-28)

- Desert scenery: bones, fused glass, fallen pylons, rock spires, craters and old tracks
- Wrecks with an amber beacon: search them for fuel or Particle X, spare parts and sometimes a survivor
- Spotted wrecks are marked on the map
- Older saves are upgraded automatically

### 0.4.2-alpha (2026-11-27)

- The shop is split into sections: rigs, engines, tanks, collectors, cargo holds, armor, weapons and supplies

### 0.4.1-alpha (2026-11-27)

- In cities you can pay with banked credits: what you carry is used first, then the bank. Mines take only carried credits.

### 0.4.0-alpha (2026-11-27)

- Bank: deposit and withdraw in any city. Banked credits are safe.
- Losing a fight now costs the credits you carry as well as your cargo
- Garages: you start with one in Dusk Citadel and can buy or rent others. Park vehicles and store spare parts.
- The rig carries a limited number of spare parts
- Salvage: a won fight can leave spare parts, or even a battered vehicle
- The old GARAGE tab, where parts are fitted, is now FIT
- Older saves are upgraded automatically

### 0.3.0-alpha (2026-11-25)

- Crew: driver, mechanic, gunner, comms and navigation, and medic, each with a name, a trait and a portrait. You are the Road Captain.
- Every escort needs someone fit aboard to work; a bought escort comes with one green hand
- Crew are wounded or killed when their vehicle takes damage, heal over time, or can be treated in a city
- CREW tab in cities to hire; C to see, move and dismiss your people
- Older saves are upgraded automatically

### 0.2.2-alpha (2026-11-25)

- Version number on the title screen
- This version history

### 0.2.1-alpha (2026-11-25)

- Fix: collector escorts sweep their own side lanes and tuck in around obstacles. Before, they drove over ground your rig had just emptied and added almost nothing.

### 0.2.0-alpha (2026-11-24)

- Bigger screen (640x360)
- Terrain features: mountains, canyons with passes and rock pillars
- Three moving cities, each with its own prices and stock
- World map (M to open, Z to zoom)
- Caravan: buy escort vehicles (collector, gunship, guardian, scout, tanker, repair rig) from a city
- Tactical battles with front and back rows and an order for every vehicle
- Desert robbers
- Night barons: mines open at night, standing, tribute, clan trade and alliances
- Older saves are upgraded automatically

### 0.1.0-alpha (2026-11-24)

First playable.

- Real-time driving in a looping desert, with the sunset ahead and the dawn behind
- Particle X harvesting, used both as fuel and as the thing you sell
- One moving city: sell, shop, garage, repair, refuel and save
- Three hulls and upgradable parts; buying the Juggernaut wins
- Flying space pirates and turn-based battles
- Breakdowns and distress calls
- An easy start, a title screen with Continue and New game, and synthwave pixel art
