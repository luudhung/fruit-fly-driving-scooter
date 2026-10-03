import test from "node:test";
import assert from "node:assert/strict";

import {
  freshState,
  restoreState,
  getRawState,
  getState,
  tick,
  snapshotLooksUsable,
  getSimulationConfig,
  setNeuralSyncEnabled,
} from "../worker/civilization-engine.mjs";

setNeuralSyncEnabled(false);

test("runtime-neutral engine creates a usable civilization", () => {
  const state = freshState();
  assert.equal(snapshotLooksUsable(state), true);
  assert.ok(state.flies.some((fly) => fly.alive));
  assert.equal(getState().simulationAgeSeconds, 0);
  assert.equal(getSimulationConfig().worldId, "WORLD-A");
});

test("sampled catch-up tick advances by the requested game time", async () => {
  freshState();
  const before = getRawState().simulationAgeSeconds;
  await tick({ gameSeconds: 600, syncBrain: false });
  const after = getRawState().simulationAgeSeconds;
  assert.equal(after - before, 600);
  assert.ok(getState().population > 0);
});

test("restored snapshots remain monotonic after catch-up", async () => {
  freshState();
  await tick({ gameSeconds: 1200, syncBrain: false });
  const saved = structuredClone(getRawState());
  const savedAge = saved.simulationAgeSeconds;

  freshState();
  assert.equal(getRawState().simulationAgeSeconds, 0);
  restoreState(saved);
  assert.equal(getRawState().simulationAgeSeconds, savedAge);

  await tick({ gameSeconds: 300, syncBrain: false });
  assert.equal(getRawState().simulationAgeSeconds, savedAge + 300);
  assert.equal(snapshotLooksUsable(getRawState()), true);
});

test("Node adapter keeps the legacy test surface", async () => {
  const nodeAdapter = await import("../worker/civilization-server.mjs");
  assert.equal(typeof nodeAdapter.freshState, "function");
  assert.equal(typeof nodeAdapter.tick, "function");
  assert.equal(typeof nodeAdapter.restoreState, "function");
});
