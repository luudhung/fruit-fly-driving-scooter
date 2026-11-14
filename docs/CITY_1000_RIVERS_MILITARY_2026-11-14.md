# Map 29: stable vehicles, 1,000 residents, river districts and actual military operations

## Vehicle disappearance

Two reproducible faults affected personal cars and freight trucks: selection tested the old server position while drawing an interpolated position, and deleting an out-of-view motion checkpoint allowed the same old snapshot to recreate the vehicle repeatedly. Selection now uses the displayed position for continuing journeys. Dormant checkpoints retain identity/progress while offscreen, without running hidden animation or submitting GPU instances, and are removed when the authoritative actor disappears. The active car budget remains 120. Distance preference is an actual eight-metre retention band instead of subtracting 64 from squared distance. Focused tests cover both entering and leaving the view, stale plans, dense budgets, phase changes, resumption and removal.

## People and costs

A one-time migration reserves real operational homes before creating exactly the deficit to 1,000 living residents. It prioritizes at least 100 new residents each in North and West when the deficit permits, and places the requested military intake inside this total. Imported personal capital and furnishings are accounted for separately from domestic revenue. Existing identities, brains, wallets and deeds are retained. Population continues to change through ordinary births, deaths and immigration after this one-time intake.

West policy multipliers: wage .90, housing .25, property .22, food .38, living .42, pollution .42 and amenities .86. Asking prices, recurring rent/maintenance and utilities follow the revised policy; existing owners' equity is not reset. The lower costs and new river promenades improve affordability and amenities while retaining the industrial role.

The neural admission bound follows the shared population limit rather than rejecting shard inputs above 64. Per-alarm computation remains four checkpoints and the coordinator retains 16 shards with population-adjusted cadence. Entire living shard memberships remain intact so cleanup cannot erase another chunk's checkpoints.

## Geography

A 20-metre western channel uses the former north/south ring-road corridor at x=-430. A 36-metre northern river at z=-570 separates North City from the airfield and Main City, meeting the existing eastern river. Ordinary bridge crossings have separate sidewalks and axis-correct rails; motorway and metro crossings remain connected. The airport stays on the Main City bank. All 654 prior buildings preserve their IDs and geometry. Water rectangles are unioned before rendering, avoiding overlapping planes. A one-time migration re-banks stranded ground actors/parked cars and replans affected journeys without resetting their finances or transport commitments.

## Military

Fifty actual residents serve in the army, including an experienced commander, officers and enlisted ranks. Newly authorized cadets have real homes and are reserved before other public recruitment can take their positions. Existing essential workers are retained. A parade ground, firing range, aircraft, naval command building, jetty and two endowed patrol vessels use authoritative footprints. Ship and crew motion share a pure trajectory/boarding helper between the viewer and simulation. Equipment accents follow actual visible bodies, not duplicate soldiers.

Daily phases, attendance, pilot qualification, weather, treasury-funded fuel/payroll and actual crew boarding govern exercises. Rifles, initial ammunition and vessels have an explicit one-time external equipment-endowment ledger. Further ammunition consumes public funds. Abstract game shots expend rounds, stop at solid walls, and can miss, injure or kill actual people in their path; casualty recording is idempotent. Onsite practice improves weapon skill and safety, and incidents affect discipline and memory. This is a bounded simulation of choices, not a claim of human self-awareness. No real-world weapon specifications or tactics are modeled.

## Verification

A local replay of the real map-28 checkpoint preserved all 3,023 archived/resident records, brains, wallets and homes, added 286 residents (118 North, 119 West, 49 Europe), reached 1,000 living residents and 50 soldiers with two ships, and advanced 600 game seconds without new simulation faults. Production has natural ongoing population changes, so the precise new intake is calculated again from the live saved checkpoint during deployment. No production test-state import or reset is part of this release.

Final local checks: 327/327 city/neural tests, 203/203 viewer unit tests, production build and diff checks passed. Scaling fixtures now supply a real vacant European rental block and allow a full operating day for paid grid expansion to meet the larger population, rather than assuming the old 728-person demand/vacancies. The airfield, apron and passenger terminal are explicitly tested as Main City.
