# Three-country aviation integration

One authoritative world retains all existing resident brains, legacy city/island holidays and the `cityVisitors` ledger. No extra Worker or visitor simulation is created.

`createRegionalAviationSystem` books both legs of a 15-seat journey and a real destination hotel room. Fare and hotel money remain in escrow until departure, then reach existing business accounts. Airport admission is delegated to `countries.aviationAdmission` only after landing, disembarkation and immigration. Weather refunds, full return flights, restored reservations and deceased passengers release or preserve the same contracts without generating money.

Engine integration:

- Construct with the same world, startJourney/moveFly, needs/finance, country admission and air-clearance hooks.
- Initialize after `cityVisitors.init()`; contribute `addChoices`; call `handleResident` for residents before other movement and treat `countryAirTrip`/`countryFlightPlan` as exclusive commitments.
- Call `tick()` once per simulation step. It handles visitor regional trips and finite operation costs. Publish `snapshot()` as `regionalAviation`.
- Pass `aviationAdmission`, `interceptMovement` and `requestRegionalTrip` to `createCityVisitors`.
- Render actual paid regional manifests through `RegionalAviationRenderer`; keep the old scheduled-aircraft mesh only for an actual legacy `airTrip`, so a new manifest does not produce a duplicate decorative aircraft.

External visitors arrive through city or North airports in manifests of at least ten actual outside-passport brains. Two external stands and one regional shuttle stand bound new activity at each mainland airport; legacy stand IDs remain readable. Visitor movement pays border entry for actual taxi occupants or walkers. Every new visitor has a mainland two-country itinerary, completes goals only at physical attractions, and boards an outside return flight from the country actually reached after both visits. An affluent visitor may additionally buy a Hawaii return trip. Mandatory visas and the final airfare have priority over optional spending.

Core verification covers all six airport pairs, 15-seat rejection, legacy inventory, real arrival paths, once-only visas, identity/escrow across restore, estate refunds, ten North arrivals, and a full two-country external visit with physical movement and departure. Graphics use shared geometry/materials, finite aircraft pools and no lights.
