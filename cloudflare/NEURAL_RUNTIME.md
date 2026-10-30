# Persistent full FlyWire runtime

Each living resident has a separate LIF checkpoint for all 139,255 neurons: membrane voltage, both synaptic accumulators, refractory state, the previous firing set and the cumulative step count. Immutable connectivity is shared; dynamic neural state is never shared between residents.

The source brain.bin SHA-256 is `1891bf482f299e6acb9032c748c884688750e5bf231d4f2dbc4224996005b92d`. Packing transposes incoming CSR to outgoing CSR, retains all 15,091,983 original edges (including zero weights and duplicates), and indexes the 977 distinct original Float32 weight patterns. No weight is quantized or dropped. The resulting graph is 61,207,438 bytes. Event-driven propagation visits the outgoing edges of firing source neurons; the LIF membrane update still visits every neuron each millisecond. Floating-point accumulation order can differ from the original incoming-CSR implementation.

Sixteen SQLite Durable Objects partition brain IDs deterministically. Each stores its own graph cache in 1 MiB rows and loads one resident checkpoint at a time. A raw checkpoint is approximately 1.74 MiB, below SQLite's 2 MiB row limit; persisted checkpoints are gzip compressed. Saving a checkpoint and its output together provides idempotent cycle retries. Shards release inactive residents' dynamic snapshots while retaining their last recorded output. Storage is flushed per brain to bound pending data and memory.

The coordinator runs through Durable Object alarms without a browser. The default is 16 neural milliseconds per cycle. Each coordinator alarm computes at most four new resident checkpoints in one shard, then yields; retries reuse the checkpoints already committed for that cycle. This bounds CPU use even when synaptic activity increases. A resumed cycle adopts a reduced configured step budget while keeping every committed checkpoint. At 500 residents the write-budget calculation chooses a minimum 12-minute pause after each completed cycle, allowing roughly 60,000 brain checkpoint writes per day and reserving free-tier capacity for the city, indexes, alarms and retries. Actual elapsed intervals also include compute time and retries. This is deliberately **not biological real time**. Shared topology, individual checkpoints and sequential processing avoid loading 500 brains into RAM together.

Sensory encoding and regional behavioral drives follow the existing Rust worker interface. These synthetic inputs and drives bias the city's decision and movement model. This remains an approximate LIF/city model rather than a validated biological simulation. The public `/api/civilization/neural` endpoint and UI report measured current checkpoint counts, source dimensions and cumulative steps; stale brains do not count as running. Freshness uses the time a checkpoint was actually computed, so replaying an idempotent result does not make old activity appear new.

Vercel's prebuild generates the packed assets from the existing source brain parts. Binary graphs are not committed. A failed or incomplete asset deployment is retried by the coordinator; neural status exposes the error. Deployment adds the two SQL classes through migration `v2-flywire-neural` and retains the existing civilization object and save.

Verification includes lossless topology reconstruction, dense-reference LIF comparison, independent-buffer and checkpoint continuation tests, and full-size workerd runs covering 500 brains plus retry/restart behavior. The city preserves elapsed simulated time while limiting decision samples to a population-dependent CPU budget.

# Island mansion and player

Hansdrex Mansion has two floors, eight furnished rooms, an atrium with a physical staircase, a master spa, balcony, terrace and private pool. The rendering and player collision geometry come from the same layout. Minecraft-style controls use Space/the touch jump button for jumping, double tap to toggle flight, hold to rise and Shift/the minus button to descend. Double-forward or Control runs at twice walking speed. Gravity, wall/furniture collisions and step height apply to walking; the camera pitch never changes walking altitude. Collision queries use a spatial grid.


# Roads, ownership and transfers

Map v18 marks parallel curb parking bays clear of buildings, intersections, bridges and station access. Each car belongs to a living resident. A destination bay is reserved during a trip; cars are rendered with shared instanced geometry (three draw calls) and interpolate recent movement. The road scheduler encourages personal errands and physical showroom visits, targeting at least 10% of the living population driving after the fleet grows. Health, hunger, sleep, individual thrift and severe weather still constrain trips.

Compact cars cost 760 H$ times the city's price level, with a 10 H$ deposit and a zero-interest 5 H$/game-day loan. Bank reserves fund the dealer, payments return principal, and the unpaid balance is a resident liability. Vehicle stock is replenished through the vehicle supplier. Thrifty owners can keep taking the metro.

Actual interchange stations link the six metro lines. A passenger walks to a station, climbs its stairs, waits for a scheduled train, alights, walks to the next line's access and boards again. Each boarding charges its fare. Routes, transfers and boarding counters persist in the city snapshot.

Driving style combines personality, measured LIF drives, temptation and persistent action values. Occasional reckless incidents cause fines, a temporary stop and roadside damage marked with cones; city repairs transfer treasury money to a supplier. Safe travel and penalties update the driver's action values. This explicit reinforcement memory is a city-model mechanism, not evidence of human-like reasoning or a claim that the biological connectome's weights have learned to drive.

Rest episodes survive short action timers. Exhausted residents can nap in an indoor shelter, and sleepers finish recovering before starting another trip. This prevents older saves from remaining permanently exhausted even after the city clock resumes.
