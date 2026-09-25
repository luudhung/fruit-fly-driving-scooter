import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.VERCEL) {
  console.log("[prepare-vercel-assets] not running on Vercel; skip");
  process.exit(0);
}

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const CHUNK_BYTES = 24 * 1024 * 1024;
const userOrigin = process.env.FLY_ASSET_ORIGIN?.replace(/\/$/, "");
const origins = [
  userOrigin,
  "https://luudhung.me/fruit-fly-driving-scooter",
  "https://luudhung.github.io/fruit-fly-driving-scooter",
].filter(Boolean);

await mkdir(PUBLIC, { recursive: true });

async function fetchAsset(name) {
  const errors = [];
  for (const origin of origins) {
    const url = origin + "/" + name;
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        console.log("[prepare-vercel-assets] " + name + " <- " + response.url);
        return response;
      }
      errors.push(url + " HTTP " + response.status);
    } catch (error) {
      errors.push(url + " " + (error instanceof Error ? error.message : String(error)));
    }
  }
  throw new Error("Unable to fetch " + name + ": " + errors.join(" | "));
}

async function cleanParts(name) {
  const files = await readdir(PUBLIC);
  await Promise.all(files
    .filter((f) => f === name || f.startsWith(name + ".part") || f === name + ".parts.json")
    .map((f) => rm(path.join(PUBLIC, f), { force: true })));
}

async function copySmall(name) {
  const response = await fetchAsset(name);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path.join(PUBLIC, name), bytes);
  console.log("[prepare-vercel-assets] wrote " + name + " (" + (bytes.length / 1e6).toFixed(1) + " MB)");
}

async function copyChunked(name) {
  await cleanParts(name);
  const response = await fetchAsset(name);
  const bytes = Buffer.from(await response.arrayBuffer());
  const parts = [];
  for (let offset = 0, i = 0; offset < bytes.length; offset += CHUNK_BYTES, i++) {
    const chunk = bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length));
    const file = name + ".part" + String(i).padStart(2, "0");
    await writeFile(path.join(PUBLIC, file), chunk);
    parts.push({ file, size: chunk.length });
  }
  await writeFile(
    path.join(PUBLIC, name + ".parts.json"),
    JSON.stringify({ version: 1, totalBytes: bytes.length, parts }, null, 2) + "\n",
  );
  console.log("[prepare-vercel-assets] split " + name + " -> " + parts.length + " parts, " + (bytes.length / 1e6).toFixed(1) + " MB total");
}

await copySmall("assets.json");
await copySmall("brain.meta.json");
await copySmall("vnc.meta.json");
await copyChunked("brain.bin");
await copyChunked("vnc.bin");

console.log("[prepare-vercel-assets] full FlyWire + MANC assets prepared for Vercel");
