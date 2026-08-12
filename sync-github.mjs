import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = process.env.SCBENCH_GITHUB_OWNER || "carterlu0";
const REPOSITORY = process.env.SCBENCH_GITHUB_REPO || "scbench-rtl-problems";
const BRANCH = process.env.SCBENCH_GITHUB_BRANCH || "main";
const TOKEN = process.env.SCBENCH_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = resolve(process.env.SCBENCH_DATA_FILE || resolve(SCRIPT_DIR, "data", "problems.json"));
const REPOSITORY_URL = `https://github.com/${OWNER}/${REPOSITORY}`;
const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
let contentRef = BRANCH;

const headers = {
  accept: "application/vnd.github+json",
  "user-agent": "scbench-review-sync",
  "x-github-api-version": "2022-11-28"
};
if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

function apiUrl(path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API_ROOT}/${encodedPath}?ref=${encodeURIComponent(contentRef)}`;
}

async function requestJson(path) {
  const response = await fetch(apiUrl(path), { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status} while reading ${path}`);
  return response.json();
}

async function listDirectory(path) {
  const entries = await requestJson(`contents/${path}`);
  if (!Array.isArray(entries)) throw new Error(`Expected a directory at ${path}`);
  return entries;
}

async function listDirectoryIfPresent(path) {
  try {
    return await listDirectory(path);
  } catch (error) {
    if (String(error.message).includes("GitHub API 404")) return [];
    throw error;
  }
}

async function readBranchCommit() {
  const response = await fetch(`${API_ROOT}/commits/${encodeURIComponent(BRANCH)}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status} while reading commit ${BRANCH}`);
  const commit = await response.json();
  if (!commit?.sha) throw new Error(`GitHub API did not return a commit for ${BRANCH}`);
  return commit.sha;
}

async function readText(path) {
  const entry = await requestJson(`contents/${path}`);
  if (entry.type !== "file") throw new Error(`Expected a file at ${path}`);
  if (entry.encoding === "base64" && entry.content) {
    return Buffer.from(entry.content.replace(/\s/g, ""), "base64").toString("utf8");
  }
  const response = await fetch(entry.download_url, { headers });
  if (!response.ok) throw new Error(`GitHub raw file ${response.status} while reading ${path}`);
  return response.text();
}

async function readTextIfPresent(path) {
  try {
    return await readText(path);
  } catch (error) {
    if (String(error.message).includes("GitHub API 404")) return "";
    throw error;
  }
}

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanPrompt(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function trimExcerpt(value, limit) {
  const text = cleanText(value);
  return text.length > limit ? `${text.slice(0, limit).trim()}\n\n[Excerpt. Open the source artifact for the complete content.]` : text;
}

function titleFor(id, readme) {
  const knownTitles = {
    "common-cells-t1": "Common Cells",
    "verilog-axis-fifo-t1": "Verilog AXIS FIFO",
    "verilog-axis-fifo-t2": "AXIS FIFO",
    "verilog-ethernet-t2": "Verilog Ethernet",
    "taxi-axi-t3": "Taxi AXI"
  };
  if (knownTitles[id]) return knownTitles[id];
  const heading = readme.match(/^#\s+(.+)$/m)?.[1] || id.replace(/-t[1-3]$/i, "").replace(/-/g, " ");
  return heading
    .replace(/\s+T[1-3]\b/gi, "")
    .replace(/\s+(?:Test|Legacy)\s+Modernization\b.*$/i, "")
    .replace(/\s+Modernization\b.*$/i, "")
    .trim();
}

function summaryFor(id, readme) {
  const withoutHeading = readme.replace(/^#\s+.+$/m, "");
  const paragraph = withoutHeading.split(/\n\s*\n/).map(cleanText).find((text) => text && !text.startsWith("#"));
  return trimExcerpt(paragraph || `Repository package ${id}.`, 360);
}

function certificationSummary(certification) {
  const paragraph = certification
    .split(/\n\s*\n/)
    .map((part) => cleanText(part.replace(/^#+\s*/gm, "")))
    .find((part) => part && /pass|certif|result|valid/i.test(part));
  return trimExcerpt(paragraph || "Certification artifact available in the repository.", 520);
}

function certificationDate(certification) {
  const dates = certification.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
  return dates.at(-1) || "";
}

function problemTags(id, readme) {
  const base = id.replace(/-t[1-3]$/i, "");
  const tags = ["rtl", "verilog", ...base.split("-")];
  if (/cocotb|myhdl|testbench|verification/i.test(readme)) tags.push("testbench");
  return [...new Set(tags)].join(" / ");
}

function blobUrl(path) {
  return `${REPOSITORY_URL}/blob/${encodeURIComponent(BRANCH)}/${path}`;
}

async function agentResultsFor(root) {
  const runsRoot = `${root}/agent-results/runs`;
  const entries = await listDirectoryIfPresent(runsRoot);
  const runFiles = entries
    .filter((entry) => entry.type === "file" && /\.json$/i.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
  return Promise.all(runFiles.map(async (entry) => {
    const run = JSON.parse(await readText(`${runsRoot}/${entry.name}`));
    const srMatch = String(run.source_problem || "").match(/(?:^|_)pipeline_sr_checkpoint_(\d+)$/i);
    const experimentType = srMatch ? "sr" : "pipeline";
    const targetCheckpoint = srMatch ? `checkpoint_${Number(srMatch[1])}` : "";
    return {
      ...run,
      experimentType,
      targetCheckpoint,
      checkpoints: Array.isArray(run.checkpoints) ? run.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        localCheckpoint: checkpoint.checkpoint || "",
        targetCheckpoint: targetCheckpoint || checkpoint.checkpoint || ""
      })) : [],
      sourcePath: blobUrl(`${runsRoot}/${entry.name}`)
    };
  }));
}

async function buildProblem(entry, index) {
  const id = entry.name;
  const typeMatch = id.match(/-t([1-3])$/i);
  const type = typeMatch ? `T${typeMatch[1]}` : "";
  const base = id.replace(/-t[1-3]$/i, "");
  const family = base.replace(/-/g, "_");
  const root = `problems/${id}`;
  const readmePath = `${root}/README.md`;
  const certPath = `${root}/evidence/certification.md`;
  const pipelinePath = `${root}/pipeline`;
  const [readme, certification, pipelineEntries] = await Promise.all([
    readText(readmePath),
    readTextIfPresent(certPath),
    listDirectory(pipelinePath)
  ]);
  const evaluationRuns = await agentResultsFor(root);
  const checkpointFiles = pipelineEntries
    .map((item) => item.name.match(/^checkpoint_(\d+)\.md$/i))
    .filter(Boolean)
    .map((match) => ({ number: Number(match[1]), path: `${pipelinePath}/checkpoint_${match[1]}.md` }))
    .sort((left, right) => left.number - right.number);
  if (!checkpointFiles.length) throw new Error(`No checkpoint prompt found for ${id}`);
  const checkpointPrompts = await Promise.all(checkpointFiles.map(async (checkpoint) => ({
    label: `checkpoint_${checkpoint.number}`,
    prompt: cleanPrompt(await readText(checkpoint.path)),
    sourcePath: blobUrl(checkpoint.path)
  })));
  const current = checkpointPrompts.at(-1);

  return {
    number: String(index + 1).padStart(2, "0"),
    id,
    title: titleFor(id, readme),
    type,
    family,
    tags: problemTags(id, readme),
    checkpoints: checkpointFiles.length,
    summary: summaryFor(id, readme),
    prompt: trimExcerpt(current.prompt, 7000),
    certDate: certificationDate(certification),
    certSummary: certificationSummary(certification),
    readmePath: blobUrl(readmePath),
    certPath: blobUrl(certPath),
    promptPath: current.sourcePath,
    checkpointLinks: checkpointPrompts.map(({ label, sourcePath }) => [label, sourcePath]),
    checkpointPrompts,
    evaluationRuns
  };
}

async function main() {
  if (!TOKEN) throw new Error("SCBENCH_GITHUB_TOKEN or GITHUB_TOKEN is required");
  const sourceCommit = await readBranchCommit();
  contentRef = sourceCommit;
  const problemEntries = await listDirectory("problems");
  const entries = problemEntries
    .filter((entry) => entry.type === "dir" && /-t[1-3]$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  if (!entries.length) throw new Error("No typed problem directories found");
  const problems = [];
  for (const [index, entry] of entries.entries()) problems.push(await buildProblem(entry, index));
  const payload = {
    schemaVersion: 4,
    generatedAt: new Date().toISOString(),
    source: {
      repository: `${OWNER}/${REPOSITORY}`,
      branch: BRANCH,
      commit: sourceCommit
    },
    problems
  };
  let previousPayload = null;
  try {
    previousPayload = JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    previousPayload?.schemaVersion === payload.schemaVersion &&
    previousPayload?.source?.repository === payload.source.repository &&
    previousPayload?.source?.branch === payload.source.branch &&
    previousPayload?.source?.commit === payload.source.commit &&
    JSON.stringify(previousPayload.problems) === JSON.stringify(payload.problems)
  ) {
    console.log(`Already synchronized at ${sourceCommit}`);
    return;
  }
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Synced ${problems.length} problems to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
