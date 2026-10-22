import { createHash } from "node:crypto";

const sha256 = text => createHash("sha256").update(text, "utf8").digest("hex");

function promptPath(path, id, sr, filename) {
  if (path !== `problems/${id}/sr-checkpoint-${sr}/${filename}` || !/^[a-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid published prompt path: ${path}`);
  }
  return path;
}

// Missing/changed prompts fail the sync before problems.json is replaced.
export async function readCompressedRelease({ readText, blobUrl }) {
  const manifestPath = "catalog/compressed-prompts.json";
  let text;
  try { text = await readText(manifestPath); }
  catch (error) {
    if (String(error.message).includes("GitHub API 404")) return { families: new Map(), release: null };
    throw error;
  }
  const manifest = JSON.parse(text);
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.families) || !manifest.families.length) {
    throw new Error("Invalid qualified prompt release");
  }
  const families = new Map();
  for (const family of manifest.families) {
    if (families.has(family.id) || !Number.isInteger(family.sr_count) || family.sr_count < 1 ||
        family.prompts?.length !== family.sr_count) throw new Error("Incomplete/duplicate prompt family");
    const prompts = [];
    for (const [index, entry] of family.prompts.entries()) {
      if (entry.sr !== index + 1 || entry.target_checkpoint !== `checkpoint_${entry.sr}` ||
          entry.local_checkpoint !== "checkpoint_1") throw new Error("Invalid SR checkpoint mapping");
      const [original, compressed] = await Promise.all([
        readText(promptPath(entry.original_path, family.id, entry.sr, "checkpoint_1.md")),
        readText(promptPath(entry.compressed_path, family.id, entry.sr, "s.md"))
      ]);
      if (!original.trim() || !compressed.trim() || sha256(original) !== entry.original_sha256 ||
          sha256(compressed) !== entry.compressed_sha256) throw new Error(`Prompt hash mismatch: ${family.id} SR${entry.sr}`);
      prompts.push({ sr: entry.sr, targetCheckpoint: entry.target_checkpoint,
        localCheckpoint: entry.local_checkpoint,
        original: { text: original, sha256: entry.original_sha256, sourcePath: blobUrl(entry.original_path) },
        compressed: { text: compressed, sha256: entry.compressed_sha256, sourcePath: blobUrl(entry.compressed_path) }
      });
    }
    families.set(family.id, prompts);
  }
  return { families, release: { id: manifest.release, publishedAt: manifest.published_at,
    familyCount: families.size, promptCount: [...families.values()].reduce((sum, prompts) => sum + prompts.length, 0),
    sourcePath: blobUrl(manifestPath), verificationScope: manifest.verification_scope } };
}
