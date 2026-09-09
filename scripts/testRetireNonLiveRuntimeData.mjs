import assert from "node:assert/strict";
import {
  execFileSync,
} from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import {
  tmpdir,
} from "node:os";
import {
  fileURLToPath,
} from "node:url";

const root =
  mkdtempSync(
    join(
      tmpdir(),
      "cat-pro-log-retirement-",
    ),
  );
const script =
  fileURLToPath(
    new URL(
      "./retireNonLiveRuntimeData.mjs",
      import.meta.url,
    ),
  );

try {
  mkdirSync(
    join(
      root,
      "paper",
    ),
    {
      recursive:
        true,
    },
  );
  mkdirSync(
    join(
      root,
      "live",
    ),
    {
      recursive:
        true,
    },
  );
  mkdirSync(
    join(
      root,
      "execution",
    ),
    {
      recursive:
        true,
    },
  );
  writeFileSync(
    join(
      root,
      "paper",
      "trades.jsonl",
    ),
    "paper\n",
  );
  writeFileSync(
    join(
      root,
      "live",
      "orders.jsonl",
    ),
    "live\n",
  );
  writeFileSync(
    join(
      root,
      "live",
      "tiny-live-arm.jsonl",
    ),
    "retire\n",
  );
  writeFileSync(
    join(
      root,
      "execution",
      "live-performance-evidence.jsonl",
    ),
    "obsolete-unbounded-stream\n",
  );
  writeFileSync(
    join(
      root,
      "execution",
      "live-performance-checkpoint.jsonl",
    ),
    "bounded-checkpoint\n",
  );
  writeFileSync(
    join(
      root,
      "execution",
      "live-performance-checkpoint.jsonl.previous",
    ),
    "bounded-checkpoint-previous\n",
  );

  execFileSync(
    process.execPath,
    [
      script,
      `--logs=${root}`,
      "--apply",
      "--confirm=RETIRE_NON_LIVE_RUNTIME_DATA",
    ],
    {
      stdio:
        "pipe",
    },
  );

  assert.equal(
    existsSync(
      join(
        root,
        "live",
        "orders.jsonl",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "paper",
      ),
    ),
    false,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "execution",
        "live-performance-evidence.jsonl",
      ),
    ),
    false,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "execution",
        "live-performance-checkpoint.jsonl",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "execution",
        "live-performance-checkpoint.jsonl.previous",
      ),
    ),
    true,
  );
  assert.equal(
    existsSync(
      join(
        root,
        "live",
        "tiny-live-arm.jsonl",
      ),
    ),
    false,
  );

  const archives =
    readdirSync(
      join(
        root,
        "retired",
      ),
    );
  assert.equal(
    archives.length,
    1,
  );
  const archiveRoot =
    join(
      root,
      "retired",
      archives[0],
    );
  const manifest =
    JSON.parse(
      readFileSync(
        join(
          archiveRoot,
          "manifest.json",
        ),
        "utf8",
      ),
    );
  assert.equal(
    manifest.entries.length,
    3,
  );
  assert.equal(
    manifest.entries.every(
      (entry) =>
        entry.files.every(
          (file) =>
            /^[a-f0-9]{64}$/u.test(
              file.sha256,
            ),
        ),
    ),
    true,
  );

  console.log(
    "Non-LIVE log retirement test passed: PAPER/Tiny data was checksummed and archived under logs/retired while LIVE order evidence remained active.",
  );
} finally {
  rmSync(
    root,
    {
      recursive:
        true,
      force:
        true,
    },
  );
}
