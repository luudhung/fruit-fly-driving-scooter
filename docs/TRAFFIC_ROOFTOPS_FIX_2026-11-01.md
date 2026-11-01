# City map v20 — two banks and resident services

The existing world is migrated in place. Resident IDs, brain checkpoints, money, housing titles and death archives are retained. The one-time Riverside settlement adds 100 independent residents, records the external capital they bring and assigns every new household an east-bank apartment. Restoring again does not repeat the settlement.

## Streets and transport

- Directed asphalt routing uses separate lanes and bounded cached paths. Same-lane following ignores opposing/perpendicular vehicles and different road levels. Closely spaced intersections share a clearance zone.
- The river spans the full map boundary. Three bridges have separate pedestrian walks, clear overhead members and warm arch/sidewalk lights. Six bank crossings have excavated ramps and real lower vehicle paths.
- Bridge approaches continue straight through Riverside. Parking excludes narrow roads, bridge approaches, junctions and underpass ramps. Operational development access roads can provide marked loading bays.
- M7 connects Riverside with M1, M5 and M6. All 55 metro stations have sidewalk-parallel switchback stairs; the player can climb them. Interchange walkways and lifts connect platforms above the tracks. Transfers remain within one 0.5 H$ journey fare.
- Ten existing private helicopters are bound to their owners' actual homes and families, including inheritance. The airport retains two fallback bays.

## City life

- Three fire engines and two ambulances have real staff, gathering/pickup, physical vehicle routes and returns. Emergency response is twice the normal service-car speed and may pass red signals, while retaining vehicle spacing.
- The Riverside fire workshop has three open garage bays. Ambulances collect patients and deliver them to a hospital without reviving dead actors.
- Residents can commission developments across buildable east-bank land. Buildings keep small alleys. Missing access roads require funding, materials and physical road work before the building is delivered. Concurrent projects and per-tick searches are bounded rather than imposing a lifetime eight-building cap.
- Marina Bay is a hotel destination with staff shifts; tourism uses the hotel booking, room reservation, payment and checkout pipeline.

## Viewer

- The west bank retains its Manhattan grid and skyline, with brick midrises, instanced iron fire escapes and roof water tanks. Riverside uses limestone façades, tall windows, iron balconies and mansard roofs.
- Procedural sky gradients, wispy clouds, a long sunset, fixed moon/Saturn and stars provide atmosphere. Distant mountain/city silhouettes are fixed outside the map. The river uses analytic ripples and sky/sun glints rather than rendering a second reflected city.
- Night lighting and all animation execute on the viewer's device. The background Worker maintains society algorithms and compact photo scene records, not GPU effects or image frames.
- The top toolbar keeps only Settings. Resident selection synchronizes the player/camera and opens the correct inspector; touch selection accepts small finger movement. City events retain bounded history through sparse updates and the selected resident has a recent action log.
- The album belongs to residents. Archived views reconstructed later must be labeled; historical reconstruction does not imply a server-rendered photograph existed while the site was closed.

## Verification

Map checks cover all building footprints, streets, river separation, bridge approaches, underpasses, metro access and interchange clearance. The player staircase test exercises real gravity and walking. A copied production checkpoint was restored twice: all old resident identity/brain/cash/housing/death records were preserved and exactly 100 east-bank residents were added once. No production world reset or import is part of deployment.
