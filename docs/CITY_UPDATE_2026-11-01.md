# City update — 2026-11-01

The existing WORLD-A checkpoint is upgraded in place. Existing resident IDs, archived deaths, housing titles, cash and independent FlyWire step counters are preserved. A downloaded production checkpoint was restored twice and advanced offline before deployment. No new paid service or cloud resource is added.

## New behavior

- Riverside is 360×480, one third of the original 720×720 urban core. Three real river crossings include an arch/truss bridge, M1 extends into the district, six apartment blocks admit households, and market/cafe/clinic/school/office jobs serve the district. Renters may choose to view and lease a Riverside apartment after physically traveling there.
- Building fires damage property and evacuate occupants. Small crews must reach incidents, use water and receive wages. Repair and construction reserve money in escrow, purchase and deliver materials, pay for actual labor, clear rubble and reopen inspected buildings. New plots are bounded; geometry and player collision change with construction, collapse and clearance. Sustained rain can flood low riverbank streets.
- Up to 16 separate visitors reserve finite hotel rooms, spend external money, visit attractions, record photography metadata and physically return to the airport. Departures free rooms and remain distinct from resident deaths. Unsafe hotels cancel/shorten stays. Up to six taxis use actual residents' cars, shared red lights, physical pickup and one-time escrow settlement.
- Riverside Stadium and two tennis courts have capacity, fees, fitness/social effects and persisted results. The ten wealthiest existing adults receive a private helicopter once; ownership, operating costs, pad reservations, weather restrictions and inheritance persist. Flights use roof/airport access and time-stamped endpoints; the browser draws flight motion.
- Up to two civic assemblies of twelve residents can debate, mediate, escalate and settle. Participant choices, arrival, opposing factions, public confidence and bounded fictional equipment/injury/property consequences persist. This implements civic unrest, not territorial warfare.
- Camera buttons capture actual rendered JPEGs, with a 24-photo IndexedDB album on the viewing device. Residents' server-side photography records contain scene metadata; they do not contain historical rendered pixels.

## Runtime and resource boundaries

Only algorithms and durable outcomes run in the Worker. Graphics, flames, smoke, sports balls, rotor motion and smooth movement run on the viewer's CPU/GPU. The existing five-second world alarm continues without browser visits. Full FlyWire brains retain private neural state and use the established CPU-budgeted scheduler; they are not biological-real-time minds or general-purpose reasoning agents.

Bounded collections: three active fires, five active projects, eight expansion plots, sixteen visitors, six taxis, ten private helicopters, two civic assemblies, finite histories and photo records. Render batches are instanced. Local tests do not guarantee unlimited traffic fits a free plan; no paid plan is enabled by this update.

## Validation

- City/neural tests cover map connectivity, real arrivals, restart persistence, money conservation, taxi red lights, fire/repair, helicopter inheritance/diversion, finite visits, civic duties and preserved brain checkpoints.
- Existing unit tests, TypeScript build and Wrangler dry-run pass.
- Real v18 production checkpoint restores to v19 without changing existing identities, money, housing titles or neural step counts; repeated restore is idempotent.
- An initial 1,800-tick / 2.8-game-day run with 500 residents and a mid-run restore completed with finite positions: three fires extinguished, two construction projects finished, three scheduled sports fixtures, three taxi trips and twelve visitor arrivals. Subsequent natural-choice run reached fifteen tennis sessions and a physical visitor departure. These are simulation checks, not browser FPS measurements.
- Desktop Chrome visual review confirmed Riverside, bridges, stadium/courts and the actual camera/album flow. Mobile controls retain existing multi-touch, resize and browser-gesture prevention tests; final hardware Safari testing remains useful.

## Deployment

Frontend deploys from GitHub main. Worker deployment uses the previously authorized local Wrangler login. CI still verifies behavior; when repository Cloudflare credentials are absent, it clearly records that automated Worker deployment was skipped instead of reporting a false deployment success. No credentials or world backup belong in Git.
