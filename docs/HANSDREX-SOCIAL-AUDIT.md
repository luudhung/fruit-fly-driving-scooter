# Social-logic audit — 2026-09-27

The observer (`src/fulllife.ts`) consumes snapshots from a persistent Node/PostgreSQL simulation (`worker/civilization-server.mjs`). The full-connectome service supplies neural drives. It does not directly invent arbitrary executable professions, law or economics: the world engine selects from implemented actions and sectors. This distinction remains intentional and must not be misrepresented.

## Confirmed defects corrected

| Defect | Consequence | Correction |
|---|---|---|
| Different map definitions in browser and worker | Invisible obstacles, buildings on roads, cosmetic home relocation | Shared geometry, strict footprints, deterministic map migration and tested routes |
| Committed travel interrupted near intermediate waypoint | New goals before arrival | Keep goal until full route finishes |
| Metro overwrote the chosen action | Arrival at a job could remain “boarding metro” | Store pending action and restore it on arrival |
| Sleep flag set while traveling, then cleared by needs update | Sleep intent lost, outdoor sleepers | Sleep begins only after arriving at the assigned home |
| Location label retained while traveling | Remote shopping, relationships and medical treatment | Require actual arrival/presence and, where needed, matching indoor location |
| “Home” was a roadside navigation point | Sleeping appeared outside | Indoor state and physical room coordinates; exit through the door when starting a journey |
| Household capacity counted individual residents | A family with children consumed extra apartments | Ten household units per apartment building; children inherit the family unit |
| Rent charged to every member at full monthly amount every day | Children and couples paid duplicate rent; cash drained | One daily prorated bill per household, with explicit arrears |
| Spending checked a lower minimum than the actual price | Negative cash possible | Exact affordability checks before transfer |
| Several purchases/fines/rent removed money without a recipient | Money silently disappeared | Explicit transfers to business, treasury or bank; imports/exports tracked separately |
| Power-plant and bank cash omitted from reported supply | Apparent money collapse when cash changed account | Include those cash accounts in supply |
| Meals, exercise and smoking effects duplicated | Double consumption/reward/damage per tick | One activity-effects path |
| 120 simulated seconds accrued only one work minute | Workers underpaid | Accrue two work minutes per tick |
| Private employees could also receive public payroll | Double wages | Separate enterprise payroll from public salary |
| Doctor service ignored travel, training reset repeatedly | Remote treatment and lost training progress | Arrival gate; preserve learned skill values |
| Relationships updated at distance; close relatives eligible | Remote affection and invalid pairings | Presence/proximity and parent/sibling exclusion |
| Conception did not require meeting/cohabitation | Remote pregnancy | Shared household and simultaneous home presence |
| Pregnancy canceled when father died | Existing pregnancy disappeared | Continue using stored parent record |
| House purchase moved only buyer | Family members stayed at obsolete home coordinates | Update household members together |
| Vacant units and dead partners persisted | Housing leaks and unavailable relationships | Household/estate/partner cleanup |
| Independent helicopter rider clocks | One rendered helicopter represented several simultaneous routes | Shared boarding window and flight clock, actual pilot presence |
| Health could reach zero and remain alive | Contradictory HP state | Zero-health mortality handled explicitly |
| Traffic accident replaced target without replacing route | Injured residents continued along stale path | Replan complete emergency journey |

## Remaining modeling limits / incomplete backlog

- Building interiors are logical rooms; no furnished interior camera or walk-through stair/elevator simulation.
- Navigation uses a weighted lattice favoring sidewalks, not a full crowd avoidance or lane-level collision simulator. Car following and detailed right-of-way still need verification/refinement.
- Generated occupations are composed from implemented sector roles; the neural network does not generate new executable behavior code.
- Enterprise export revenue is exogenous demand and explicitly recorded; this is not a closed macroeconomic economy. Monetary policy and long-term solvency still need longer evaluation.
- Birth/death probabilities, education, health and life stages are human-like synthetic rules on a compressed calendar, not biological fruit-fly predictions.
- Cohabitation is implemented for a simple eligible couple; divorce/property division, multi-property inheritance and complex blended-family moves are incomplete.
- Organized conflict/military/ceasefire, explicit infidelity/jealousy and staged house construction remain listed in the backlog until implemented and tested.
- Real mobile/iPad GPU performance and production worker migration require deployment/browser evidence; successful unit tests alone do not establish them.

## Evidence

Checkpoint 1: production build/typecheck; 130-resident simulation for 500 ticks, no blocked outdoor positions, actual sleeping/work and metro completions.

Checkpoint 2: eight deterministic regression tests cover footprint separation, route safety, train station service, stationary indoor sleeping, household rent/capacity, money transfer conservation, medical presence and migration preserving finances/brain IDs. All passed locally. No production database was modified by tests.
