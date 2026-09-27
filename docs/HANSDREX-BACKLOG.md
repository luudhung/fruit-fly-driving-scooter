# Hansdrex City — authoritative backlog and audit

User backlog received 2026-09-27. Preserve all requirements below. Existing power grid, electricity debt/disconnection, justice, helicopter tours, stress/happiness tuning, touch inspector and 120x time scale must remain. Never substitute a synthetic brain for the existing connectome bridge. City actions remain a synthetic utility-based simulation influenced by neural signals, not a biological claim that a fly understands money or politics.

Status after checkpoints 1–5: code/build and deterministic simulation checked locally; production deployment not yet verified. “Partial” is not a claim that every requirement is complete.

| # | Scope and acceptance criteria | Status / evidence / remaining work |
|---|---|---|
| 1 | About 2x map area; no buildings on roads/water/rail; skyline grows towards center; recognizable Empire/Toronto/Petronas and crowns | Partial: shared map v9, 810×810 ground vs 570×570, one geometry source, footprint tests; visual/deployment checks pending |
| 2 | Central Park paths, pond, benches, lamps, tall planted trees, coherent green space; no trees on concrete | Partial: redesigned reserved park, road gaps, tree exclusion and instancing; visual check and pond navigation audit pending |
| 3 | Unique nonoverlapping lots; buy/build homes and apartments; 10 families/apartment building, 1 family/house; sleep indoors | Partial: shared lots, household capacity, shared homes and migration; financial transactions, family moving and construction audit pending |
| 4 | Sidewalk walking; no river/building traversal; contextual flight; crossings/signals; faster vehicles; actual metro boarding/stations/parking | Partial: obstacle-checked routes and scheduled trains, boarding/completed-trip counts, parking state; intersection/vehicle audit pending |
| 5 | Affluent/wealthy/elite private cars; buy, own, drive, park, commute; operational showroom | Partial: existing purchasing connected to rendered cars; parking/ownership lifecycle audit pending |
| 6 | Autonomous coffee/shops/meals/work/park/home/shelter; varied behavior; no drifting sleep | Partial: preserve intended activity through metro, arrival gating, rain diversion, stationary sleep; full activity audit pending |
| 7 | Distinct café, market, restaurants, signs, recognizable storefronts and varied buildings | Partial: destinations reserved and rendered with awnings/shopfronts; visual refinement pending |
| 8 | Staffed 3D sky bar at Empire, chosen by AI | Partial: deck/bar/tables and relocated destination; staffing/service audit pending |
| 9 | About 130 residents, visible activity, avoid apparent empty/stationary city | Partial: all quality levels allow 132, working/traveling/indoors telemetry; crowd/occupancy UX audit pending |
| 10 | Diverse jobs, resident businesses, hiring and wages; neural-influenced new roles; money never mysteriously vanishes | Partial: existing economy retained; arrival/work mismatch fixed; accounting and payroll audit pending |
| 11 | Low income/working/middle/affluent/wealthy/elite; varied food, housing, shopping, luxury, probabilistic health/longevity | Partial: existing social class and neural preferences retained; spending/health audit pending |
| 12 | Romance, jealousy, infidelity, fights, death and internal HP; family logic | Partial: existing romance/assault/death retained; proximity/cohabitation/infidelity audit pending |
| 13 | School, skilled teachers, generational transmission, voluntary extra study; individual memory/learning | Partial: existing cognition retained; attendance/service gates audit pending |
| 14 | Multiple parties, campaigns, elections, interest-based conflict; emergent extremism, military/barracks/casualties/negotiation/ceasefire | Partial: existing political system retained; organized conflict/military not implemented yet |
| 15 | Police, doctors, hospital, enforcement, profession training and observable service behavior | Partial: existing services retained; proximity/arrival/training audit pending |
| 16 | Mobile translucent directional/altitude controls; comfortable look/rotation | Partial: existing controls retained; cancel/blur cleanup and responsive layout improved; browser check pending |
| 17 | Collapsible panels; stable inspector and mobile/tablet display | Partial: overflow bounds improved; complete browser verification pending |
| 18 | Look-down + forward descends; intuitive mouse/touch camera | Partial: preserved camera direction; pointer cancellation fixed; browser verification pending |
| 19 | Low/medium/high/ultra; fewer meshes/trees/lights/animations; attractive high-quality metro; smooth mobile/iPad | Partial: instanced trees, static windows, detailed trains; performance measurement on real devices pending |
| 20 | Audit collision, outdoor sleep/rain, decorative-only metro, idle labor, weather-dominated logs and lifeless city | Partial: 500 ticks × 130 agents: 0 blocked outdoor positions, max 96 sleepers, max 20 working, 141 completed metro trips. This is local simulation evidence, not a production or full-brain benchmark. |

Priorities: (1) visible geometry/collision/park/activity, (2) housing/cars/metro/shelter/sleep, (3) shops/sky bar/mobile/performance, (4) politics/conflict/deeper economy. User additionally requested a complete social-logic audit and incremental commits during work.

Validation checkpoint 1: `npm run typecheck`, `npm run build`, map route/overlap tests and a 500-tick isolated simulation. The test import does not access PostgreSQL or start the live server. Preserve persisted world data when deploying; migration advances mapVersion without resetting resident finances or brains.


## 2026-09-27 evening additions and verification

User-directed emergency target is **100 living residents**, overriding the older ~130 starting target; later births can grow toward the existing 132 cap.

| Scope | Status |
|---|---|
| Live population header, click to rank money / age / natural ascending ID | Done in branch; Chromium desktop and 390px mobile verified, 100 rows, no page errors or horizontal page overflow. Registered neural brains are not population. |
| One-time recovery to 100, no resurrection/deletion of dead archives | Done in branch and regression tested. Emergency immigration now counts living residents, not lifetime array length. |
| Cheap food and water | Done in branch: staple meals cost at most 0.1 H$, zero-cash residents receive the meal, public subsidy pays merchant, free water indoors and at park; essentials available at home/shelter. |
| 1,000 H$ per newborn, twins 2,000 | Done in branch: per-child persisted ledger prevents duplicate grants. Treasury pays; insufficient funds use explicitly recorded monetary issuance. Expected grant affects family financial readiness; pregnancy remains voluntary/conditional. |
| Free stress relief | Done in branch: free park and Great Wheel for everyone; helicopter fare subsidized for stressed adults, subject to weather, pilot, hours and seats. |
| Large Central Park / Manhattan grid / giant wheel | Done in branch: 62×100 park, 3.7× previous park area, grid roads and M5 rerouted outside, lake, walkways, benches/lamps/instanced trees, 42-high wheel with 16 cabins and actual boarding/completion. Park camera button. Visual preview verified. |
| Historical death causes | Partial: aggregated stored causes and overlapping risk indicators implemented, but cannot yet query historical production archive. Do not claim dehydration caused most of the 140 historical deaths. |
| Production recovery | Railway CIV_INITIAL_POPULATION=100 on primary; API confirmed 100 living. Restart exposed different checkpoint: D108 / 140 deaths before; D83 / 9 deaths after, matching secondary WORLD-A simulation. At 14:19 UTC the secondary was verified under WORLD-A-V2-ISOLATED / EXP-V2-ISOLATED; primary remained at 100 living. Do not describe the earlier checkpoint rewind as preserved production history. |
| Full production deployment of branch fixes | Pending approved merge of PR #3. Public production currently runs older code. |
| Remaining original backlog | All 20 categories above retained. Complete politics/organized conflict/army/ceasefire, infidelity, deeper emergent economics, construction progression and real-device GPU benchmarks remain unfinished. |

Validation: 15 regression tests passing and production build passing. One-hour-equivalent isolated run (3,600 ticks × 100 agents, alternating clear/rain, no live connectome input): 100 alive, 0 deaths, 0 critically hungry/thirsty, average health 96, 18 completed free wheel rides, 799 completed metro trips. This tests local lifecycle behavior, not long-term biological realism or live economic equilibrium.
