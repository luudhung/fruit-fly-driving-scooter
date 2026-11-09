import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {gzipSync} from "node:zlib";
import {exportSnapshot, loadSnapshot, saveSnapshot} from "../cloudflare/src/civilization-snapshot.mjs";

class SnapshotStorage {
  entries = new Map();

  async get(key) {
    if (Array.isArray(key)) return new Map(key.map(name => [name, this.entries.get(name)]));
    return this.entries.get(key);
  }

  async put(key, value) {
    this.entries.set(key, value);
  }

  async delete(key) {
    this.entries.delete(key);
  }

  async transaction(write) {
    await write(this);
  }
}

test("legacy checkpoints remain readable and export the original city", async () => {
  const storage = new SnapshotStorage();
  const state = {worldId: "WORLD-A", simulationAgeSeconds: 345600, flies: [{id: "FLY-1", brain: {id: "BRAIN-1"}}]};
  await storage.put("snapshot:meta", {version: 1, chunks: 1, lastWallClockMs: 1234});
  await storage.put("snapshot:chunk:0", gzipSync(JSON.stringify(state)));
  assert.deepEqual((await loadSnapshot(storage)).state, state);
  assert.deepEqual((await new Response(await exportSnapshot(storage, state.worldId)).json()).state, state);
  await storage.delete("snapshot:chunk:0");
  await assert.rejects(loadSnapshot(storage), /Missing civilization snapshot chunk/);
});

test("large checkpoints preserve active and archived residents across chunks and export ordinary JSON", async () => {
  const storage = new SnapshotStorage();
  const state = {
    worldId: "WORLD-A",
    simulationAgeSeconds: 201638319.7190038,
    flies: Array.from({length: 110}, (_, i) => ({
      id: `FLY-${i}`,
      alive: i % 2 === 0,
      brain: {id: `BRAIN-${i}`, memory: randomBytes(22_000).toString("base64") + " tiếng Việt\n🪰"},
    })),
  };
  const stats = await saveSnapshot(storage, state, 7890);
  assert.ok(stats.chunks > 1);
  const saved = await loadSnapshot(storage);
  assert.equal(saved.lastWallClockMs, 7890);
  assert.deepEqual(saved.state, state);
  assert.deepEqual((await new Response(await exportSnapshot(storage, state.worldId)).json()).state, state);
});
