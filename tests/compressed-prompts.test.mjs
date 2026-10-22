import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readCompressedRelease } from "../sync-prompts.mjs";

const hash = text => createHash("sha256").update(text).digest("hex");
const original = "Original full contract\n";
const compressed = "<script>untrusted</script>\nCompressed full contract\n";
const entry = {sr:1,target_checkpoint:"checkpoint_1",local_checkpoint:"checkpoint_1",
  original_path:"problems/test-t1/sr-checkpoint-1/checkpoint_1.md",original_sha256:hash(original),
  compressed_path:"problems/test-t1/sr-checkpoint-1/s.md",compressed_sha256:hash(compressed)};
const manifest = {schema_version:1,release:"test",families:[{id:"test-t1",sr_count:1,prompts:[entry]}]};
function reader(value=manifest, change={}) {
  return async path => {
    if (path.startsWith("catalog/")) return JSON.stringify(value);
    if (path in change) return change[path];
    if (path === entry.original_path) return original;
    if (path === entry.compressed_path) return compressed;
    throw new Error("GitHub API 404");
  };
}
const blobUrl = path => `https://github.com/example/repo/blob/commit/${path}`;

test("sync retains complete byte-identical SR prompts and checkpoint mapping", async () => {
  const result=await readCompressedRelease({readText:reader(),blobUrl});
  assert.equal(result.release.promptCount,1);
  assert.equal(result.families.get("test-t1")[0].compressed.text,compressed);
  assert.equal(result.families.get("test-t1")[0].original.text,original);
  assert.equal(result.families.get("test-t1")[0].targetCheckpoint,"checkpoint_1");
  assert.equal(result.families.get("test-t1")[0].compressed.sourcePath,blobUrl(entry.compressed_path));
});
test("sync rejects truncated/missing prompts, inconsistent SR maps, duplicate families and unsafe paths", async () => {
  for (const change of [{[entry.compressed_path]:"truncated"},{[entry.original_path]:""}]) {
    await assert.rejects(readCompressedRelease({readText:reader(manifest,change),blobUrl}),/hash mismatch/);
  }
  for (const modify of [m=>m.families[0].sr_count=2,m=>m.families.push(m.families[0]),
    m=>m.families[0].prompts[0].target_checkpoint="checkpoint_2",
    m=>m.families[0].prompts[0].compressed_path="../private.json"]) {
    const changed=structuredClone(manifest); modify(changed);
    await assert.rejects(readCompressedRelease({readText:reader(changed),blobUrl}));
  }
  await assert.rejects(readCompressedRelease({readText:async p=>p.startsWith("catalog/")?JSON.stringify(manifest):Promise.reject(new Error("missing prompt")),blobUrl}),/missing prompt/);
});
test("review escapes prompt content and includes full text, hashes and separate source links", async () => {
  const source=await readFile(new URL("../app.js",import.meta.url),"utf8");
  const helpers=source.slice(source.indexOf("function renderSrPrompts"),source.indexOf("function renderReview"));
  const context={escapeHtml:value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")};
  vm.runInNewContext(`${helpers}; globalThis.render=renderSrPrompts`,context);
  const {families}=await readCompressedRelease({readText:reader(),blobUrl});
  const html=context.render({srPrompts:families.get("test-t1")});
  assert.ok(html.includes("&lt;script&gt;untrusted&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes(hash(compressed)));
  assert.ok(html.includes("Compressed full contract\n"));
  assert.ok(html.includes(blobUrl(entry.original_path)));
  assert.ok(html.includes(blobUrl(entry.compressed_path)));
});
test("synchronized qualified release has ten families and all 48 hash-verified prompt pairs", async () => {
  const data=JSON.parse(await readFile(new URL("../data/problems.json",import.meta.url),"utf8"));
  assert.equal(data.compressedRelease.familyCount,10);
  assert.equal(data.compressedRelease.promptCount,48);
  const families=data.problems.filter(p=>p.srPrompts?.length);
  assert.equal(families.length,10);
  assert.equal(families.reduce((n,p)=>n+p.srPrompts.length,0),48);
  for(const family of families) for(const prompt of family.srPrompts) for(const mode of ["original","compressed"]){
    assert.ok(prompt[mode].text.trim());
    assert.equal(hash(prompt[mode].text),prompt[mode].sha256);
    assert.ok(prompt[mode].sourcePath.includes(`/blob/${data.source.commit}/`));
  }
});
