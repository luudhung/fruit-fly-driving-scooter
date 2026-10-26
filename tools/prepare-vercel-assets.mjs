import { mkdir, readdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {writePackedConnectome} from "./pack-connectome.mjs";

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
  "https://fruit-fly-driving-scooter.vercel.app",
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

async function copyExistingChunks(name) {
  const response = await fetchAsset(name + ".parts.json");
  const manifest = await response.json();
  if (!Array.isArray(manifest.parts) || manifest.parts.length === 0 || manifest.parts.length > 128 ||
      !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes <= 0) {
    throw new Error("Invalid chunk manifest for " + name);
  }
  let totalBytes = 0;
  const parts = [];
  for (const part of manifest.parts) {
    if (typeof part.file !== "string" || !part.file.startsWith(name + ".part") ||
        path.basename(part.file) !== part.file || !Number.isSafeInteger(part.size) || part.size <= 0) {
      throw new Error("Invalid chunk entry for " + name);
    }
    const chunkResponse = await fetchAsset(part.file);
    const bytes = Buffer.from(await chunkResponse.arrayBuffer());
    if (bytes.length !== part.size) throw new Error("Chunk size mismatch for " + part.file);
    await writeFile(path.join(PUBLIC, part.file), bytes);
    parts.push({ file: part.file, size: bytes.length });
    totalBytes += bytes.length;
  }
  if (totalBytes !== manifest.totalBytes) throw new Error("Total size mismatch for " + name);
  await writeFile(path.join(PUBLIC, name + ".parts.json"),
    JSON.stringify({ version: 1, totalBytes, parts }, null, 2) + "\n");
  console.log("[prepare-vercel-assets] restored " + name + " from " + parts.length + " existing chunks");
}

async function copyChunked(name) {
  await cleanParts(name);
  try {
    await copyExistingChunks(name);
    return;
  } catch (error) {
    console.log("[prepare-vercel-assets] chunk source unavailable; trying full binary: " + (error instanceof Error ? error.message : String(error)));
    await cleanParts(name);
  }
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
await copyChunked("flybody.bundle.bin");

console.log("[prepare-vercel-assets] full FlyWire + MANC + flybody assets prepared for Vercel");

const brainParts=JSON.parse(await readFile(path.join(PUBLIC,'brain.bin.parts.json'),'utf8'));
const completeGraph=Buffer.concat(await Promise.all(brainParts.parts.map(p=>readFile(path.join(PUBLIC,p.file)))));
const compactGraph=await writePackedConnectome(completeGraph,path.join(PUBLIC,'neural'));
console.log('[prepare-vercel-assets] lossless event graph: '+compactGraph.numNeurons+' neurons, '+compactGraph.numEdges+' edges, '+compactGraph.totalBytes+' bytes');
