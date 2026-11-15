# Map 31: North layout and bridge access repair

North civic buildings, airport and border booths now have walls ending underneath a separate opaque roof slab. Aurora's stepped caps likewise own their exterior top planes. This removes differently coloured coplanar surfaces that flashed as the camera moved, without adding lights or effects.

Aurora keeps its existing building ID, height, ownership and occupants, moving from the park to its own vacant plot at (-198, -970), across the park's northern street. No adjacent homes move. A one-time migration updates the same apartment block, household coordinates, current interiors, damage and construction records, preserving budgets, brains and titles.

N1 ends at (50, -950) in the built-up area. Its airport connection and transfers to M8/M10 remain; tracks, supports, stations and stairs no longer cross the farm. A separate version-31 marker safely handles existing N1 passengers and future transfers, preserving fares and unrelated train journeys.

Bridge rails, suspenders, lamps and piers use the same shared layout for rendering and physical street colliders. Transverse road and walking approaches have openings; parallel footways and mid-river edges keep protection. Grade-separated roads passing beneath bridges do not remove upper railings. Motorway rail pieces are clipped at actual ramp approaches. Harbor causeways have no affected outer railings. Static batching remains bounded and no real lights are added.

Validation includes roof surface ray intersections from changing viewpoints, vacant-plot/park/road clearance, saved-world identity and deed preservation, domestic metro interchange and passenger migration, render/collider agreement, real player-car passage through former shore barriers and underpass clearance. Production incident creation is not used for validation.
