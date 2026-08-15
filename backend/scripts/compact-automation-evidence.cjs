"use strict";

const {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require("node:fs");
const { dirname, join, resolve } = require("node:path");

const {
  readLatestValidJsonlRecord,
} = require("../dist/core/persistence/JsonlTailReader.js");

const evidenceDirectory = resolve(__dirname, "../logs/automation");

const targets = [
  {
    name: "candidate-evidence.jsonl",
    maximumLineBytes: 16 * 1024 * 1024,
    isValid(value) {
      return isRecord(value) &&
        value.schemaVersion === 1 &&
        Number.isFinite(value.persistedAt) &&
        Array.isArray(value.routes) &&
        "processedAuthoritativeSnapshots" in value;
    },
  },
  {
    name: "capital-aware-qualification-evidence.jsonl",
    maximumLineBytes: 16 * 1024 * 1024,
    isValid(value) {
      return isRecord(value) &&
        value.schemaVersion === 1 &&
        Number.isFinite(value.persistedAt) &&
        Array.isArray(value.routes) &&
        "processedSnapshots" in value;
    },
  },
  {
    name: "shadow-learning-evidence.jsonl",
    maximumLineBytes: 64 * 1024 * 1024,
    isValid(value) {
      return isRecord(value) &&
        value.schemaVersion === 1 &&
        Number.isFinite(value.persistedAt) &&
        Array.isArray(value.queueItems) &&
        Array.isArray(value.dispatchRecords) &&
        Array.isArray(value.outcomeRecords);
    },
  },
];

function isRecord(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function assertContained(filePath) {
  if (dirname(filePath) !== evidenceDirectory) {
    throw new Error(`Refusing path outside automation evidence directory: ${filePath}`);
  }
}

function validateSingleRecord(filePath, target) {
  const contents = readFileSync(filePath, "utf8");
  const lines = contents.split(/\r?\n/u).filter((line) => line.trim().length > 0);

  if (lines.length !== 1) {
    throw new Error(`${target.name}: compact file must contain exactly one JSONL record.`);
  }

  const parsed = JSON.parse(lines[0]);

  if (!target.isValid(parsed)) {
    throw new Error(`${target.name}: compact record failed schema validation.`);
  }
}

function durableWrite(filePath, contents) {
  const descriptor = openSync(filePath, "wx");

  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function compact(target) {
  const activePath = join(evidenceDirectory, target.name);
  const temporaryPath = `${activePath}.compact.tmp`;
  const pendingPath = `${activePath}.reclaim.pending`;

  [activePath, temporaryPath, pendingPath].forEach(assertContained);

  if (!existsSync(activePath)) {
    throw new Error(`${target.name}: active file does not exist.`);
  }

  if (existsSync(temporaryPath) || existsSync(pendingPath)) {
    throw new Error(`${target.name}: a previous compaction artifact exists; refusing to overwrite it.`);
  }

  const recovered = readLatestValidJsonlRecord(
    activePath,
    target.isValid,
    { maximumLineBytes: target.maximumLineBytes },
  );

  if (!recovered) {
    throw new Error(`${target.name}: no valid record was recoverable; original was left untouched.`);
  }

  const compactContents = `${JSON.stringify(recovered.value)}\n`;
  durableWrite(temporaryPath, compactContents);
  validateSingleRecord(temporaryPath, target);

  let originalMoved = false;
  let replacementInstalled = false;

  try {
    renameSync(activePath, pendingPath);
    originalMoved = true;

    renameSync(temporaryPath, activePath);
    replacementInstalled = true;

    validateSingleRecord(activePath, target);
    unlinkSync(pendingPath);

    return {
      name: target.name,
      previousBytes: recovered.fileSizeBytes,
      compactBytes: Buffer.byteLength(compactContents, "utf8"),
      reclaimedBytes: recovered.fileSizeBytes - Buffer.byteLength(compactContents, "utf8"),
      persistedAt: recovered.value.persistedAt,
      bytesRead: recovered.bytesRead,
    };
  } catch (error) {
    if (replacementInstalled && existsSync(activePath)) {
      unlinkSync(activePath);
    }

    if (originalMoved && existsSync(pendingPath)) {
      renameSync(pendingPath, activePath);
    }

    throw error;
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
}

const results = targets.map(compact);
console.log(JSON.stringify({ evidenceDirectory, results }, null, 2));
