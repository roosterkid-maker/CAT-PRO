import {
  createHash,
} from "node:crypto";

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  basename,
  dirname,
  join,
  relative,
  resolve,
} from "node:path";

const EXACT_CONFIRMATION =
  "RETIRE_NON_LIVE_RUNTIME_DATA";
const apply =
  process.argv.includes(
    "--apply",
  );
const confirmation =
  process.argv
    .find(
      (argument) =>
        argument.startsWith(
          "--confirm=",
        ),
    )
    ?.slice(
      "--confirm=".length,
    ) ??
  "";
const logsArgument =
  process.argv
    .find(
      (argument) =>
        argument.startsWith(
          "--logs=",
        ),
    )
    ?.slice(
      "--logs=".length,
    );
const logsRoot =
  resolve(
    logsArgument ??
      join(
        process.cwd(),
        "backend",
        "logs",
      ),
  );

if (
  !existsSync(
    logsRoot,
  )
) {
  console.log(
    `No log directory exists at ${logsRoot}.`,
  );
  process.exit(
    0,
  );
}

const candidates =
  collectCandidates(
    logsRoot,
  );

console.log(
  JSON.stringify(
    {
      mode:
        apply
          ? "APPLY"
          : "DRY_RUN",
      logsRoot,
      candidates:
        candidates.map(
          (path) =>
            relative(
              logsRoot,
              path,
            ),
        ),
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log(
    `Dry run only. Re-run with --apply --confirm=${EXACT_CONFIRMATION}.`,
  );
  process.exit(
    0,
  );
}

if (
  confirmation !==
    EXACT_CONFIRMATION
) {
  throw new Error(
    `Exact confirmation is required: --confirm=${EXACT_CONFIRMATION}`,
  );
}

const stamp =
  new Date()
    .toISOString()
    .replaceAll(
      ":",
      "-",
    );
const archiveRoot =
  resolve(
    logsRoot,
    "retired",
    `non-live-${stamp}`,
  );
const manifest = [];

for (
  const source
  of candidates
) {
  const sourceRelative =
    relative(
      logsRoot,
      source,
    );
  const destination =
    join(
      archiveRoot,
      sourceRelative,
    );
  const files =
    listFiles(
      source,
    );
  const fileEvidence =
    files.map(
      (file) => ({
        path:
          relative(
            source,
            file,
          ) ||
          basename(
            file,
          ),
        sha256:
          sha256(
            file,
          ),
      }),
    );

  mkdirSync(
    dirname(
      destination,
    ),
    {
      recursive:
        true,
    },
  );

  renameSync(
    source,
    destination,
  );

  manifest.push({
    source:
      sourceRelative,
    destination:
      relative(
        archiveRoot,
        destination,
      ),
    files:
      fileEvidence,
  });
}

mkdirSync(
  archiveRoot,
  {
    recursive:
      true,
  },
);
writeFileSync(
  join(
    archiveRoot,
    "manifest.json",
  ),
  `${JSON.stringify({
    schemaVersion:
      "1.0",
    retiredAt:
      Date.now(),
    sourceRoot:
      logsRoot,
    entries:
      manifest,
  }, null, 2)}\n`,
  "utf8",
);

console.log(
  `Retired ${manifest.length} non-live path(s) to ${archiveRoot}. No LIVE order, fill, settlement, recovery or capital-movement journal was selected.`,
);

function collectCandidates(
  root,
) {
  const matcher =
    /(^|[-_.])(paper|shadow|tiny[-_]?live)([-_.]|$)/i;
  const found = [];

  for (
    const entry
    of readdirSync(
      root,
      {
        withFileTypes:
          true,
      },
    )
  ) {
    const path =
      join(
        root,
        entry.name,
      );

    if (
      entry.name ===
        "retired"
    ) {
      continue;
    }

    const relativePath =
      relative(
        logsRoot,
        path,
      )
        .replaceAll(
          "\\",
          "/",
        )
        .toLowerCase();
    const explicitlyRetired =
      [
        "automation",
        "paper",
        "shadow",
        "statistical-arbitrage",
        "strategies",
        "control/paper-capital-configuration.jsonl",
        "control/personal-bot-runtime.jsonl",
        "control/strategy-one-policy-activations.jsonl",
      ].includes(
        relativePath,
      );

    if (
      explicitlyRetired ||
      matcher.test(
        entry.name,
      )
    ) {
      found.push(
        path,
      );
      continue;
    }

    if (
      entry.isDirectory()
    ) {
      for (
        const nested
        of collectCandidates(
          path,
        )
      ) {
        found.push(
          nested,
        );
      }
    }
  }

  return found;
}

function listFiles(
  path,
) {
  if (
    statSync(
      path,
    ).isFile()
  ) {
    return [
      path,
    ];
  }

  return readdirSync(
    path,
    {
      withFileTypes:
        true,
    },
  ).flatMap(
    (entry) =>
      listFiles(
        join(
          path,
          entry.name,
        ),
      ),
  );
}

function sha256(
  path,
) {
  return createHash(
    "sha256",
  )
    .update(
      readFileSync(
        path,
      ),
    )
    .digest(
      "hex",
    );
}
